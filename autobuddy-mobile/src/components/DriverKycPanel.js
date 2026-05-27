import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

function digitsOnly(value, maxLength) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

export default function DriverKycPanel({ token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [kycStatus, setKycStatus] = useState(null);
  const [form, setForm] = useState({
    aadhaar_number: '',
    license_number: '',
    rc_number: '',
    aadhaar_image_url: '',
    license_image_url: '',
    rc_image_url: '',
    selfie_image_url: '',
  });

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const refreshKyc = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const payload = await apiRequest('/drivers/kyc', { token });
      setKycStatus(payload || null);
      if (payload && payload.status !== 'not_submitted') {
        setForm((prev) => ({
          ...prev,
          aadhaar_number: String(payload.aadhaar_number || prev.aadhaar_number || ''),
          license_number: String(payload.license_number || prev.license_number || ''),
          rc_number: String(payload.rc_number || prev.rc_number || ''),
          aadhaar_image_url: String(payload.aadhaar_image_url || prev.aadhaar_image_url || ''),
          license_image_url: String(payload.license_image_url || prev.license_image_url || ''),
          rc_image_url: String(payload.rc_image_url || prev.rc_image_url || ''),
          selfie_image_url: String(payload.selfie_image_url || prev.selfie_image_url || ''),
        }));
      }
    } catch (err) {
      setError(err.message || 'Could not load KYC status.');
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshKyc().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshKyc]);

  const submitKyc = async () => {
    const payload = {
      aadhaar_number: digitsOnly(form.aadhaar_number, 12),
      license_number: String(form.license_number || '').trim(),
      rc_number: String(form.rc_number || '').trim(),
      aadhaar_image_url: String(form.aadhaar_image_url || '').trim(),
      license_image_url: String(form.license_image_url || '').trim(),
      rc_image_url: String(form.rc_image_url || '').trim(),
      selfie_image_url: String(form.selfie_image_url || '').trim(),
    };
    if (
      payload.aadhaar_number.length !== 12 ||
      !payload.license_number ||
      !payload.rc_number ||
      !payload.aadhaar_image_url ||
      !payload.license_image_url ||
      !payload.rc_image_url ||
      !payload.selfie_image_url
    ) {
      setError('Complete Aadhaar, license, RC, selfie, and document image URLs.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setMessage('');
      const result = await apiRequest('/drivers/kyc', {
        method: 'POST',
        token,
        body: payload,
      });
      setMessage(result?.message || 'KYC submitted for admin review.');
      await refreshKyc();
    } catch (err) {
      setError(err.message || 'Could not submit KYC.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>KYC & Driver Documents</Text>
      <Text style={styles.subtitle}>Status: {String(kycStatus?.status || 'not submitted')}</Text>
      {!!kycStatus?.reject_reason && (
        <Text style={styles.error}>Rejected: {kycStatus.reject_reason}</Text>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!message && <Text style={styles.message}>{message}</Text>}
      {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}

      <Text style={styles.label}>Aadhaar Number</Text>
      <VoiceTextInput
        value={form.aadhaar_number}
        onChangeText={(value) => updateField('aadhaar_number', digitsOnly(value, 12))}
        keyboardType="number-pad"
        maxLength={12}
        placeholder="12-digit Aadhaar"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Driving License Number</Text>
      <VoiceTextInput
        value={form.license_number}
        onChangeText={(value) => updateField('license_number', value)}
        placeholder="License number"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Vehicle RC Number</Text>
      <VoiceTextInput
        value={form.rc_number}
        onChangeText={(value) => updateField('rc_number', value)}
        placeholder="RC number"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Aadhaar Image URL</Text>
      <VoiceTextInput
        value={form.aadhaar_image_url}
        onChangeText={(value) => updateField('aadhaar_image_url', value)}
        placeholder="https://.../aadhaar.jpg"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>License Image URL</Text>
      <VoiceTextInput
        value={form.license_image_url}
        onChangeText={(value) => updateField('license_image_url', value)}
        placeholder="https://.../license.jpg"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>RC Image URL</Text>
      <VoiceTextInput
        value={form.rc_image_url}
        onChangeText={(value) => updateField('rc_image_url', value)}
        placeholder="https://.../rc.jpg"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Selfie Image URL</Text>
      <VoiceTextInput
        value={form.selfie_image_url}
        onChangeText={(value) => updateField('selfie_image_url', value)}
        placeholder="https://.../selfie.jpg"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <TouchableOpacity style={styles.button} onPress={submitKyc} disabled={loading}>
        <Text style={styles.buttonText}>Submit KYC For Review</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    backgroundColor: COLORS.surface,
    padding: 14,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  title: { color: COLORS.textMain, fontSize: 17, fontWeight: '900' },
  subtitle: { color: COLORS.textMuted, fontWeight: '700', marginTop: 4, marginBottom: 10 },
  label: { color: COLORS.textMain, fontWeight: '700', marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: COLORS.textMain,
    marginBottom: 9,
  },
  button: {
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  error: { color: COLORS.danger, fontWeight: '700', marginBottom: 8 },
  message: { color: COLORS.primary, fontWeight: '700', marginBottom: 8 },
  loader: { marginBottom: 8 },
});
