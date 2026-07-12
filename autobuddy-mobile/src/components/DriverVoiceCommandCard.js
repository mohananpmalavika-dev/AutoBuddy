import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../theme';

const LANGUAGE_OPTIONS = [
  { code: 'en-IN', label: 'English' },
  { code: 'ml-IN', label: 'Malayalam' },
];

const QUICK_COMMANDS = [
  { label: 'Online', action: { type: 'go_online' } },
  { label: 'Ride', action: { type: 'resume_active_ride' } },
  { label: 'Map', action: { type: 'navigate_active_ride' } },
  { label: 'Earnings', action: { type: 'tab', tab: 'earnings' } },
  { label: 'SOS', action: { type: 'sos' }, danger: true },
];

function getStatusCopy(voice) {
  if (voice.errorMessage) {
    return voice.errorMessage;
  }
  if (voice.transcript) {
    return voice.transcript;
  }
  if (voice.voiceState === 'listening') {
    return voice.labels.listening;
  }
  if (voice.voiceState === 'processing') {
    return voice.labels.processing;
  }
  return voice.labels.ready;
}

export default function DriverVoiceCommandCard({
  voice,
  onCommand,
  compact = false,
  disabled = false,
  quickCommands = QUICK_COMMANDS,
}) {
  const isListening = voice.voiceState === 'listening';

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.titleBlock}>
          <View style={styles.eyebrowRow}>
            <MaterialIcons name="record-voice-over" size={16} color={COLORS.primary} />
            <Text style={styles.eyebrow}>Driver Voice</Text>
          </View>
          <Text style={styles.title}>Minimal command control</Text>
        </View>

        <View style={styles.languageRow}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = voice.currentLanguage === option.code;
            return (
              <TouchableOpacity
                key={option.code}
                style={[styles.languageButton, selected && styles.languageButtonActive]}
                onPress={() => voice.switchLanguage(option.code)}
                accessibilityRole="button"
                accessibilityLabel={`Driver voice language ${option.label}`}>
                <Text style={[styles.languageText, selected && styles.languageTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.commandRow, compact && styles.commandRowCompact]}>
        <TouchableOpacity
          style={[
            styles.micButton,
            isListening && styles.micButtonListening,
            (!voice.isVoiceAvailable || disabled) && styles.disabled,
          ]}
          onPress={isListening ? voice.stopListening : voice.startListening}
          disabled={!voice.isVoiceAvailable || disabled}
          accessibilityRole="button"
          accessibilityLabel={isListening ? 'Stop driver voice command' : 'Start driver voice command'}>
          <MaterialIcons name={isListening ? 'stop' : 'mic'} size={22} color="#FFFFFF" />
          <Text style={styles.micText}>{isListening ? 'Stop' : 'Speak'}</Text>
        </TouchableOpacity>

        <View style={styles.statusBlock}>
          <Text
            style={[
              styles.statusText,
              voice.errorMessage && styles.statusTextError,
              voice.transcript && !voice.errorMessage && styles.statusTextTranscript,
            ]}
            numberOfLines={compact ? 3 : 2}>
            {getStatusCopy(voice)}
          </Text>
          <Text style={styles.engineText}>
            {voice.voiceEngine ? `Voice: ${voice.voiceEngine}` : 'Voice unavailable'}
          </Text>
        </View>
      </View>

      <View style={styles.quickRow}>
        {quickCommands.map((command) => (
          <TouchableOpacity
            key={command.label}
            style={[styles.quickButton, command.danger && styles.quickButtonDanger, disabled && styles.disabled]}
            onPress={() => onCommand(command.action, { source: 'quick_chip' })}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Driver command ${command.label}`}>
            <Text style={[styles.quickText, command.danger && styles.quickTextDanger]}>{command.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBDCC7',
    backgroundColor: '#F7FCF8',
    padding: 14,
    gap: 12,
  },
  cardCompact: {
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerCompact: {
    alignItems: 'stretch',
  },
  titleBlock: {
    flex: 1,
    minWidth: 190,
    gap: 4,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: COLORS.textMain,
    fontSize: 18,
    fontWeight: '900',
  },
  languageRow: {
    flexDirection: 'row',
    gap: 6,
  },
  languageButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  languageButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E8F5E9',
  },
  languageText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  languageTextActive: {
    color: COLORS.primary,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commandRowCompact: {
    alignItems: 'stretch',
  },
  micButton: {
    minHeight: 46,
    minWidth: 120,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  micButtonListening: {
    backgroundColor: '#B91C1C',
  },
  micText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  statusBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  statusText: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  statusTextTranscript: {
    color: COLORS.primary,
  },
  statusTextError: {
    color: COLORS.danger,
  },
  engineText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickButton: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  quickButtonDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  quickText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '900',
  },
  quickTextDanger: {
    color: COLORS.danger,
  },
  disabled: {
    opacity: 0.55,
  },
});
