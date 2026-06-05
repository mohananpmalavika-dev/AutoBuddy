import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

const CANCEL_REASONS = [
  { value: 'passenger_no_show', label: 'Passenger no-show' },
  { value: 'vehicle_issue', label: 'Vehicle issue' },
  { value: 'route_or_safety_concern', label: 'Route or safety concern' },
  { value: 'driver_emergency', label: 'Driver emergency' },
  { value: 'wrong_trip_details', label: 'Wrong trip details' },
  { value: 'other', label: 'Other' },
];

export default function DriverCancelRidePanel({
  visible = false,
  booking,
  loading = false,
  onCancel,
  onSubmit,
}) {
  const [reasonCode, setReasonCode] = useState(CANCEL_REASONS[0].value);
  const [reasonText, setReasonText] = useState('');
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false);

  const selectedReason = useMemo(
    () => CANCEL_REASONS.find((reason) => reason.value === reasonCode) || CANCEL_REASONS[0],
    [reasonCode],
  );

  if (!visible) {
    return null;
  }

  const submit = () => {
    if (!policyAcknowledged || loading) {
      return;
    }
    onSubmit?.({
      reason_code: reasonCode,
      reason_text: String(reasonText || selectedReason.label).trim(),
      policy_acknowledged: true,
      policy_version: 'driver_cancel_v1',
      support_context: {
        source: 'driver_dashboard',
        active_booking_id: booking?.id,
        active_booking_status: booking?.status,
      },
      passenger_context: {
        visible_reason: selectedReason.label,
      },
    });
  };

  return (
    <View style={[styles.panel, SHADOWS.card]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Cancel Ride</Text>
          <Text style={styles.subtitle}>Reason and policy acknowledgement are saved for support review.</Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onCancel} disabled={loading}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Reason</Text>
      <View style={styles.reasonGrid}>
        {CANCEL_REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.value}
            style={[styles.reasonChip, reasonCode === reason.value && styles.reasonChipActive]}
            onPress={() => setReasonCode(reason.value)}
            disabled={loading}>
            <Text style={[styles.reasonChipText, reasonCode === reason.value && styles.reasonChipTextActive]}>
              {reason.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <VoiceTextInput
        value={reasonText}
        onChangeText={setReasonText}
        placeholder="Add passenger/support context"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
        multiline
      />

      <TouchableOpacity
        style={styles.policyRow}
        onPress={() => setPolicyAcknowledged((current) => !current)}
        disabled={loading}>
        <View style={[styles.checkbox, policyAcknowledged && styles.checkboxActive]}>
          <Text style={styles.checkboxText}>{policyAcknowledged ? 'OK' : ''}</Text>
        </View>
        <Text style={styles.policyText}>
          I understand this cancellation will notify the passenger and may be reviewed by support. No passenger fee is applied automatically here.
        </Text>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel} disabled={loading}>
          <Text style={styles.secondaryButtonText}>Keep Ride</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dangerButton, (!policyAcknowledged || loading) && styles.buttonDisabled]}
          onPress={submit}
          disabled={!policyAcknowledged || loading}>
          <Text style={styles.dangerButtonText}>{loading ? 'Cancelling...' : 'Confirm Cancel'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F3B2A8',
    padding: 14,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '900', color: COLORS.textMain },
  subtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 3, maxWidth: 420 },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F2F4F7',
    alignSelf: 'flex-start',
  },
  closeButtonText: { color: COLORS.textMain, fontWeight: '700', fontSize: 12 },
  label: { color: COLORS.textMain, fontWeight: '800', marginBottom: 8 },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  reasonChip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  reasonChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  reasonChipText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 12 },
  reasonChipTextActive: { color: COLORS.primary },
  input: {
    minHeight: 78,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    padding: 10,
    color: COLORS.textMain,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  policyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  policyText: { flex: 1, color: COLORS.textMain, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  secondaryButtonText: { color: COLORS.textMain, fontWeight: '800' },
  dangerButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#D32F2F',
  },
  dangerButtonText: { color: '#FFFFFF', fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
});
