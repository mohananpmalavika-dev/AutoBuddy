import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { apiRequest } from '../lib/api';
import {
  getMyDriverTrustScore,
  runKycAiReview,
  verifyAadhaar,
  verifySelfie,
} from '../lib/driverTrustApi';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

const SELFIE_DOC_TYPE = 'selfie';

function formatAadhaar(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 12);
}

function getSelfieDocument(payload = {}) {
  return payload?.documents?.[SELFIE_DOC_TYPE] || null;
}

function getAssetFileName(asset) {
  return asset?.fileName || asset?.name || 'driver-selfie.jpg';
}

export default function DriverTrustCard({ token }) {
  const [aadhaar, setAadhaar] = useState('');
  const [selfieDocument, setSelfieDocument] = useState(null);
  const [selfieVerification, setSelfieVerification] = useState(null);
  const [score, setScore] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);

  const setTimedMessage = useCallback((nextMessage) => {
    setMessage(nextMessage);
    setTimeout(() => setMessage(''), 3000);
  }, []);

  const refreshSelfieDocument = useCallback(async () => {
    if (!token) {
      return null;
    }
    const payload = await apiRequest('/drivers/documents', { token });
    const document = getSelfieDocument(payload);
    setSelfieDocument(document);
    return document;
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshSelfieDocument().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshSelfieDocument]);

  async function handleAadhaarVerify() {
    try {
      setBusy(true);
      const clean = formatAadhaar(aadhaar);
      if (clean.length !== 12) {
        throw new Error('Aadhaar must be exactly 12 digits');
      }
      const result = await verifyAadhaar(token, clean);
      setTimedMessage(result?.aadhaar?.message || 'Aadhaar format verified.');
      Alert.alert('Aadhaar Verification', result?.aadhaar?.message || 'Verified');
    } catch (err) {
      Alert.alert('Aadhaar Verification Failed', err.message || 'Could not verify Aadhaar');
    } finally {
      setBusy(false);
    }
  }

  const uploadSelfie = useCallback(
    async () => {
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera access is required to take a verification selfie.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });
        if (result.canceled || !result.assets?.length) {
          return;
        }
        const asset = result.assets[0];
        const fileSize = Number(asset.fileSize || asset.size || 0);
        if (fileSize > 5 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Selfie image must be less than 5MB.');
          return;
        }

        setUploadingSelfie(true);
        setMessage('');
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          name: getAssetFileName(asset),
        });

        const response = await apiRequest(`/drivers/documents/${SELFIE_DOC_TYPE}`, {
          method: 'POST',
          token,
          body: formData,
          isFormData: true,
        });
        const document = response?.document || null;
        setSelfieDocument(document);
        setTimedMessage('Selfie uploaded. Submit it for verification when ready.');
        await refreshSelfieDocument().catch(() => null);
      } catch (err) {
        Alert.alert('Selfie Upload Failed', err.message || 'Could not upload selfie');
      } finally {
        setUploadingSelfie(false);
      }
    },
    [refreshSelfieDocument, setTimedMessage, token],
  );

  async function handleSelfieVerify() {
    try {
      setBusy(true);
      const selfieUrl = selfieDocument?.download_url;
      if (!selfieUrl) {
        throw new Error('Take and upload a verification selfie first');
      }
      const result = await verifySelfie(token, { selfie_url: selfieUrl });
      setSelfieVerification(result || null);
      setTimedMessage(result?.message || 'Selfie submitted for liveness review.');
      Alert.alert('Selfie Verification', result?.message || 'Submitted for review');
    } catch (err) {
      Alert.alert('Selfie Verification Failed', err.message || 'Could not verify selfie');
    } finally {
      setBusy(false);
    }
  }

  async function handleKycAiReview() {
    try {
      setBusy(true);
      const result = await runKycAiReview(token);
      Alert.alert(
        'KYC AI Review',
        `Status: ${result?.status || 'unknown'}\nScore: ${result?.kyc_ai_score ?? 'N/A'}`,
      );
    } catch (err) {
      Alert.alert('KYC AI Review Failed', err.message || 'Could not process KYC AI review');
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadScore() {
    try {
      setBusy(true);
      const result = await getMyDriverTrustScore(token);
      setScore(result || null);
    } catch (err) {
      Alert.alert('Trust Score Failed', err.message || 'Could not fetch trust score');
    } finally {
      setBusy(false);
    }
  }

  const selfieReady = Boolean(selfieDocument?.download_url);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Driver Trust System</Text>
      <Text style={styles.subtitle}>
        Aadhaar format checks, secure selfie review, KYC AI review, fraud score, blacklist, and complaint signals.
      </Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {(busy || uploadingSelfie) && <ActivityIndicator color="#2563EB" style={styles.loader} />}

      <Text style={styles.label}>Aadhaar Number</Text>
      <VoiceTextInput
        value={aadhaar}
        onChangeText={(value) => setAadhaar(formatAadhaar(value))}
        keyboardType="number-pad"
        maxLength={12}
        placeholder="Enter 12-digit Aadhaar"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />
      <TouchableOpacity style={styles.secondaryButton} onPress={handleAadhaarVerify} disabled={busy || uploadingSelfie}>
        <Text style={styles.buttonText}>Verify Aadhaar</Text>
      </TouchableOpacity>

      <View style={styles.selfieBox}>
        <Text style={styles.selfieTitle}>Selfie liveness review</Text>
        <Text style={styles.selfieText}>
          Take a fresh selfie from the app. The backend owns liveness and face-match decisions; drivers never enter scores.
        </Text>
        <Text style={styles.selfieStatus}>
          {selfieReady ? `Ready: ${selfieDocument.filename || 'selfie uploaded'}` : 'No selfie uploaded yet'}
        </Text>
        {selfieVerification ? (
          <Text style={styles.selfieResult}>
            Status: {selfieVerification.selfie_verified ? 'verified' : selfieVerification.status || 'manual review'}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.secondaryButton, (busy || uploadingSelfie) && styles.buttonDisabled]}
          onPress={uploadSelfie}
          disabled={busy || uploadingSelfie}
        >
          <Text style={styles.buttonText}>{uploadingSelfie ? 'Uploading...' : selfieReady ? 'Retake Selfie' : 'Take Selfie'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, (!selfieReady || busy || uploadingSelfie) && styles.buttonDisabled]}
          onPress={handleSelfieVerify}
          disabled={!selfieReady || busy || uploadingSelfie}
        >
          <Text style={styles.buttonText}>Submit Selfie Verification</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleKycAiReview} disabled={busy || uploadingSelfie}>
        <Text style={styles.buttonText}>Run KYC AI Review</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.darkButton} onPress={handleLoadScore} disabled={busy || uploadingSelfie}>
        <Text style={styles.buttonText}>View Driver Fraud Score</Text>
      </TouchableOpacity>

      {score ? (
        <View style={styles.scoreBox}>
          <Text style={styles.scoreTitle}>Fraud Score: {score.fraud_score}/100</Text>
          <Text style={styles.scoreSub}>Risk Level: {score.risk_level}</Text>
          <Text style={styles.scoreSub}>
            Reasons: {Array.isArray(score.reasons) && score.reasons.length ? score.reasons.join(', ') : 'None'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    padding: 14,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  title: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    color: '#475569',
    fontWeight: '600',
    fontSize: 12,
  },
  label: {
    color: '#1E293B',
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    marginBottom: 8,
  },
  selfieBox: {
    borderWidth: 1,
    borderColor: '#D6DEE8',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  selfieTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  selfieText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginBottom: 8,
  },
  selfieStatus: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  selfieResult: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  secondaryButton: {
    borderRadius: 10,
    backgroundColor: '#2563EB',
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  darkButton: {
    borderRadius: 10,
    backgroundColor: '#111827',
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  message: {
    color: '#16A34A',
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
  },
  loader: {
    marginBottom: 8,
  },
  scoreBox: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D6DEE8',
    backgroundColor: '#FFFFFF',
    padding: 10,
  },
  scoreTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  scoreSub: {
    marginTop: 4,
    color: '#475569',
    fontWeight: '600',
  },
});
