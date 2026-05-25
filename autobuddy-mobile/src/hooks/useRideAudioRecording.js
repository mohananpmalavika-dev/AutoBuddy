import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

function nowIso() {
  return new Date().toISOString();
}

export function useRideAudioRecording() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [lastRecording, setLastRecording] = useState(null);

  const startedAtRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const nativeRecordingRef = useRef(null);

  const startRecording = useCallback(async () => {
    setError('');
    if (recording) {
      return { ok: true, already_recording: true };
    }

    startedAtRef.current = nowIso();

    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        const message = 'Audio recording is not supported in this browser.';
        setError(message);
        throw new Error(message);
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event?.data && event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      return { ok: true };
    }

    let AudioModule = null;
    try {
      AudioModule = require('expo-av').Audio;
    } catch {
      const message = 'Native audio capture requires expo-av. Install with: npx expo install expo-av';
      setError(message);
      throw new Error(message);
    }

    const permission = await AudioModule.requestPermissionsAsync();
    if (!permission?.granted) {
      const message = 'Microphone permission is required for safety recording.';
      setError(message);
      throw new Error(message);
    }

    await AudioModule.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const rec = new AudioModule.Recording();
    await rec.prepareToRecordAsync(AudioModule.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    nativeRecordingRef.current = rec;
    setRecording(true);
    return { ok: true };
  }, [recording]);

  const stopRecording = useCallback(async () => {
    const startedAt = startedAtRef.current;
    const endedAt = nowIso();
    startedAtRef.current = null;

    if (!recording) {
      return null;
    }

    if (Platform.OS === 'web') {
      const recorder = mediaRecorderRef.current;
      const stream = mediaStreamRef.current;
      if (!recorder) {
        setRecording(false);
        return null;
      }

      const result = await new Promise((resolve) => {
        recorder.onstop = () => {
          try {
            const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            const uri = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : '';
            const duration = startedAt ? Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0;
            resolve({
              uri: uri || `local-audio://${Date.now()}`,
              duration_seconds: duration,
              mime_type: recorder.mimeType || 'audio/webm',
              size_bytes: blob.size,
              started_at: startedAt,
              ended_at: endedAt,
            });
          } catch {
            resolve(null);
          }
        };
        recorder.stop();
      });

      if (stream?.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      mediaChunksRef.current = [];
      setRecording(false);
      if (result) {
        setLastRecording(result);
      }
      return result;
    }

    const rec = nativeRecordingRef.current;
    if (!rec) {
      setRecording(false);
      return null;
    }
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI() || `local-audio://${Date.now()}`;
    nativeRecordingRef.current = null;
    setRecording(false);

    let durationMs = 0;
    try {
      const status = await rec.getStatusAsync();
      durationMs = Number(status?.durationMillis || 0);
    } catch {
      durationMs = 0;
    }
    const result = {
      uri,
      duration_seconds: Math.max(0, Math.round(durationMs / 1000)),
      mime_type: 'audio/m4a',
      size_bytes: null,
      started_at: startedAt,
      ended_at: endedAt,
    };
    setLastRecording(result);
    return result;
  }, [recording]);

  return {
    recording,
    error,
    lastRecording,
    startRecording,
    stopRecording,
  };
}
