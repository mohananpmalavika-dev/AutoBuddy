import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

function formatNumbers(numbers) {
  if (!numbers || typeof numbers !== 'object') {
    return 'Police 112 | Women 181 | Ambulance 108';
  }
  const police = numbers.police || '112';
  const women = numbers.women_helpline || '181';
  const ambulance = numbers.ambulance || '108';
  return `Police ${police} | Women ${women} | Ambulance ${ambulance}`;
}

export default function KeralaSafetyCard({
  safety,
  compact = false,
}) {
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [voiceCommand, setVoiceCommand] = useState('');

  const numbersLabel = useMemo(
    () => formatNumbers(safety?.emergencyNumbers),
    [safety?.emergencyNumbers],
  );

  const handleAddContact = async () => {
    const name = String(contactName || '').trim();
    const phone = String(contactPhone || '').trim();
    if (!name || !phone) {
      return;
    }
    await safety.addContact({ name, phone, relation: 'Family' });
    setContactName('');
    setContactPhone('');
  };

  const handleVoiceCommand = async (text) => {
    setVoiceCommand(text);
    await safety.processVoiceSafetyCommand(text);
  };

  const womenModeOn = Boolean(safety?.mode?.women_safety_mode);
  const isBusy = Boolean(safety?.busy);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={styles.title}>Kerala Safety Shield</Text>
      <Text style={styles.subtitle}>Women mode, SOS escalation, family tracking, Malayalam voice</Text>

      {!!safety?.message && <Text style={styles.message}>{safety.message}</Text>}
      {!!safety?.error && <Text style={styles.error}>{safety.error}</Text>}

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.safeBtn, womenModeOn && styles.safeBtnActive]}
          onPress={safety.enableWomenSafetyMode}
          disabled={isBusy}>
          <Text style={styles.btnText}>
            {womenModeOn ? 'Women Safety ON' : 'Enable Women Safety'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.sosBtn]}
          onLongPress={() => safety.activateSos('Hold SOS trigger', 'hold_button')}
          onPress={() => safety.activateSos('Manual SOS trigger', 'tap_button')}
          disabled={isBusy}>
          <Text style={styles.btnText}>{safety?.recording ? 'SOS + Recording' : 'SOS'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.miniBtn]}
          onPress={safety.startAudioRecording}
          disabled={isBusy || safety?.recording}>
          <Text style={styles.btnText}>Start Audio</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.miniBtn]}
          onPress={safety.stopAudioRecording}
          disabled={isBusy || !safety?.recording}>
          <Text style={styles.btnText}>Stop Audio</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.callBtn]}
          onPress={() => safety.callEmergencyNumber('police')}
          disabled={isBusy}>
          <Text style={styles.btnText}>Call Police</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.emergencyText}>Kerala Emergency: {numbersLabel}</Text>
      {!!safety?.safetyScore?.safety_score && (
        <Text style={styles.scoreText}>Safety score: {safety.safetyScore.safety_score}/100</Text>
      )}

      {!compact && (
        <>
          <View style={styles.voiceBlock}>
            <Text style={styles.fieldTitle}>Malayalam Voice Safety</Text>
            <VoiceTextInput
              value={voiceCommand}
              onChangeText={handleVoiceCommand}
              voiceLang="ml-IN"
              placeholder='Say: "രക്ഷിക്കൂ" or "sahaayikku"'
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.contactsBlock}>
            <Text style={styles.fieldTitle}>Trusted Contacts</Text>
            <VoiceTextInput
              value={contactName}
              onChangeText={setContactName}
              placeholder="Contact name"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
            <VoiceTextInput
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              placeholder="Contact phone"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
            <TouchableOpacity style={[styles.btn, styles.addBtn]} onPress={handleAddContact} disabled={isBusy}>
              <Text style={styles.btnText}>Add Trusted Contact</Text>
            </TouchableOpacity>

            {Array.isArray(safety?.trustedContacts) && safety.trustedContacts.length > 0 ? (
              <View style={styles.contactsList}>
                {safety.trustedContacts.slice(0, 5).map((contact) => (
                  <View key={contact.id} style={styles.contactRow}>
                    <Text style={styles.contactText}>
                      {contact.name} ({contact.phone})
                    </Text>
                    <TouchableOpacity
                      style={styles.removeChip}
                      onPress={() => safety.removeContact(contact.id)}
                      disabled={isBusy}>
                      <Text style={styles.removeChipText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>No trusted contacts added yet.</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#F5C9C9',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFF5F5',
    ...SHADOWS.soft,
  },
  cardCompact: {
    padding: 10,
  },
  title: {
    color: '#7F1D1D',
    fontWeight: '900',
    fontSize: 16,
  },
  subtitle: {
    color: '#7F1D1D',
    marginTop: 3,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...SHADOWS.soft,
  },
  safeBtn: {
    backgroundColor: '#256D2F',
  },
  safeBtnActive: {
    backgroundColor: '#1B5E20',
  },
  sosBtn: {
    backgroundColor: '#C62828',
  },
  miniBtn: {
    backgroundColor: '#5D4037',
  },
  callBtn: {
    backgroundColor: '#0B7285',
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    alignSelf: 'flex-start',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  emergencyText: {
    color: '#7F1D1D',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  scoreText: {
    color: '#7F1D1D',
    fontSize: 12,
    marginBottom: 8,
  },
  message: {
    color: '#1B5E20',
    fontWeight: '700',
    marginBottom: 8,
  },
  error: {
    color: '#B00020',
    fontWeight: '700',
    marginBottom: 8,
  },
  voiceBlock: {
    marginTop: 6,
    marginBottom: 8,
  },
  contactsBlock: {
    marginTop: 6,
  },
  fieldTitle: {
    color: '#303030',
    fontWeight: '800',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: COLORS.textMain,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  contactsList: {
    marginTop: 8,
    gap: 6,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    color: '#414141',
    flex: 1,
    fontSize: 12,
  },
  removeChip: {
    borderWidth: 1,
    borderColor: '#D7A3A3',
    borderRadius: 999,
    backgroundColor: '#FFF',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  removeChipText: {
    color: '#7F1D1D',
    fontSize: 11,
    fontWeight: '700',
  },
  muted: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
});
