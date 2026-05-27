import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  SCHEDULE_TIMEZONES,
  addMinutes,
  dateFromZonedParts,
  describeScheduledPickup,
  formatScheduleInputFromDate,
  formatScheduleInputFromParts,
  parseScheduleInput,
  validateScheduledPickup,
} from '../lib/scheduling';
import { COLORS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

const DEFAULT_LABELS = {
  title: 'Pickup time',
  date: 'Date',
  time: 'Time',
  timezone: 'Timezone',
  manual: 'Manual',
  ready: 'Ready',
};

const DEFAULT_MESSAGES = {
  required: 'Select pickup time for scheduled ride.',
  invalid: 'Enter a valid pickup date and time.',
  future: 'Scheduled pickup time must be at least 2 minutes in the future.',
};

function shortDateLabel(date, timezone) {
  return formatScheduleInputFromDate(date, timezone).slice(5, 10);
}

function getSelectedParts(value, timezone) {
  const parsed = parseScheduleInput(value, timezone);
  if (parsed.valid) {
    return parsed.parts;
  }
  return null;
}

export default function ScheduledPickupPicker({
  value,
  onChangeText,
  timezone = 'local',
  onTimezoneChange,
  inputStyle,
  labels = {},
  messages = {},
}) {
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };
  const mergedMessages = { ...DEFAULT_MESSAGES, ...messages };
  const validation = validateScheduledPickup(value, timezone, mergedMessages);
  const readyLabel = describeScheduledPickup(value, timezone);

  const dateOptions = useMemo(() => {
    const now = new Date();
    return [0, 1, 2, 3].map((offset) => {
      const date = addMinutes(now, offset * 24 * 60);
      const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : shortDateLabel(date, timezone);
      return { offset, label, date };
    });
  }, [timezone]);

  const timeOptions = useMemo(() => {
    const now = new Date();
    return [
      { label: '+30 min', date: addMinutes(now, 30), kind: 'relative' },
      { label: '+1 hr', date: addMinutes(now, 60), kind: 'relative' },
      { label: '+2 hr', date: addMinutes(now, 120), kind: 'relative' },
      { label: '09:00', hour: 9, minute: 0, kind: 'fixed' },
      { label: '14:00', hour: 14, minute: 0, kind: 'fixed' },
      { label: '18:00', hour: 18, minute: 0, kind: 'fixed' },
    ];
  }, []);

  const applyDate = (option) => {
    const currentParts = getSelectedParts(value, timezone);
    const fallbackParts = getSelectedParts(formatScheduleInputFromDate(addMinutes(new Date(), 60), timezone), timezone);
    const optionParts = getSelectedParts(formatScheduleInputFromDate(option.date, timezone), timezone);
    onChangeText(formatScheduleInputFromParts({
      ...optionParts,
      hour: currentParts?.hour ?? fallbackParts.hour,
      minute: currentParts?.minute ?? fallbackParts.minute,
    }));
  };

  const applyTime = (option) => {
    if (option.kind === 'relative') {
      onChangeText(formatScheduleInputFromDate(option.date, timezone));
      return;
    }

    const currentParts = getSelectedParts(value, timezone);
    const fallbackParts = getSelectedParts(formatScheduleInputFromDate(addMinutes(new Date(), 60), timezone), timezone);
    const candidateParts = {
      ...(currentParts || fallbackParts),
      hour: option.hour,
      minute: option.minute,
    };
    const candidateDate = dateFromZonedParts(candidateParts, timezone);
    const safeDate =
      candidateDate.getTime() <= addMinutes(new Date(), 2).getTime()
        ? addMinutes(candidateDate, 24 * 60)
        : candidateDate;

    onChangeText(formatScheduleInputFromDate(safeDate, timezone));
  };

  const applyTimezone = (nextTimezone) => {
    if (nextTimezone === timezone) {
      return;
    }
    const parsed = parseScheduleInput(value, timezone);
    if (parsed.valid) {
      onChangeText(formatScheduleInputFromDate(parsed.date, nextTimezone));
    }
    if (typeof onTimezoneChange === 'function') {
      onTimezoneChange(nextTimezone);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{mergedLabels.title}</Text>

      <Text style={styles.sectionLabel}>{mergedLabels.date}</Text>
      <View style={styles.chipRow}>
        {dateOptions.map((option) => (
          <TouchableOpacity
            key={`date-${option.offset}`}
            style={styles.chip}
            onPress={() => applyDate(option)}>
            <Text style={styles.chipText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>{mergedLabels.time}</Text>
      <View style={styles.chipRow}>
        {timeOptions.map((option) => (
          <TouchableOpacity
            key={`time-${option.label}`}
            style={styles.chip}
            onPress={() => applyTime(option)}>
            <Text style={styles.chipText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>{mergedLabels.timezone}</Text>
      <View style={styles.chipRow}>
        {SCHEDULE_TIMEZONES.map((option) => {
          const selected = option.key === timezone;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => applyTimezone(option.key)}>
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>{mergedLabels.manual}</Text>
      <VoiceTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="2026-05-31 08:30"
        placeholderTextColor={COLORS.textMuted}
        style={[styles.input, inputStyle]}
      />
      {validation.valid ? (
        <Text style={styles.readyText}>{mergedLabels.ready}: {readyLabel}</Text>
      ) : (
        <Text style={styles.errorText}>{validation.message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
  label: {
    color: COLORS.textMain,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  chipText: {
    color: COLORS.textMain,
    fontWeight: '700',
    fontSize: 12,
  },
  chipTextActive: {
    color: COLORS.primaryDark,
  },
  input: {
    marginBottom: 4,
  },
  readyText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
