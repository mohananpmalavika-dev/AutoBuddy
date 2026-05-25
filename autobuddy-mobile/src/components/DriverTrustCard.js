import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  getMyDriverTrustScore,
  runKycAiReview,
  verifyAadhaar,
  verifySelfie,
} from '../lib/driverTrustApi';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

function formatAadhaar(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 12);
}

export default function DriverTrustCard({ token }) {
  const [aadhaar, setAadhaar] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [livenessScore, setLivenessScore] = useState('0.82');
  const [faceMatchScore, setFaceMatchScore] = useState('0.89');
  const [score, setScore] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleAadhaarVerify() {
    try {
      setBusy(true);
      const clean = formatAadhaar(aadhaar);
      if (clean.length !== 12) {
        throw new Error('Aadhaar must be exactly 12 digits');
      }
      const result = await verifyAadhaar(token, clean);
      Alert.alert('Aadhaar Verification', result?.aadhaar?.message || 'Verified');
    } catch (err) {
      Alert.alert('Aadhaar Verification Failed', err.message || 'Could not verify Aadhaar');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelfieVerify() {
    try {
      setBusy(true);
      if (!String(selfieUrl || '').trim()) {
        throw new Error('Provide a selfie URL');
      }
      const result = await verifySelfie(token, {
        selfie_url: String(selfieUrl || '').trim(),
        liveness_score: Number(livenessScore || 0),
        face_match_score: Number(faceMatchScore || 0),
      });
      Alert.alert('Selfie Verification', result?.message || 'Processed');
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

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Driver Trust System</Text>
      <Text style={styles.subtitle}>
        Aadhaar verification, KYC AI, selfie liveness, fraud score, blacklist and complaints engine.
      </Text>

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
      <TouchableOpacity style={styles.secondaryButton} onPress={handleAadhaarVerify} disabled={busy}>
        <Text style={styles.buttonText}>Verify Aadhaar</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Selfie URL</Text>
      <VoiceTextInput
        value={selfieUrl}
        onChangeText={setSelfieUrl}
        placeholder="https://.../selfie.jpg"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />
      <View style={styles.inlineRow}>
        <View style={styles.inlineField}>
          <Text style={styles.label}>Liveness (0-1)</Text>
          <VoiceTextInput
            value={livenessScore}
            onChangeText={setLivenessScore}
            keyboardType="decimal-pad"
            placeholder="0.82"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />
        </View>
        <View style={styles.inlineField}>
          <Text style={styles.label}>Face Match (0-1)</Text>
          <VoiceTextInput
            value={faceMatchScore}
            onChangeText={setFaceMatchScore}
            keyboardType="decimal-pad"
            placeholder="0.89"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleSelfieVerify} disabled={busy}>
        <Text style={styles.buttonText}>Verify Selfie</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primaryButton} onPress={handleKycAiReview} disabled={busy}>
        <Text style={styles.buttonText}>Run KYC AI Review</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.darkButton} onPress={handleLoadScore} disabled={busy}>
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
  inlineRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineField: {
    flex: 1,
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
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
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
