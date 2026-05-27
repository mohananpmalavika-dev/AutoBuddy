export const SCHEDULE_TIMEZONES = [
  { key: 'local', label: 'Device time', shortLabel: 'Local', offsetMinutes: null },
  { key: 'asia_kolkata', label: 'India Standard Time', shortLabel: 'IST', offsetMinutes: 330 },
];

const DEFAULT_MESSAGES = {
  required: 'Select pickup time for scheduled ride.',
  invalid: 'Enter a valid pickup date and time.',
  future: 'Scheduled pickup time must be at least 2 minutes in the future.',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTimezoneConfig(timezoneKey) {
  return SCHEDULE_TIMEZONES.find((item) => item.key === timezoneKey) || SCHEDULE_TIMEZONES[0];
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function getZonedParts(date, timezoneKey = 'local') {
  const config = getTimezoneConfig(timezoneKey);
  if (typeof config.offsetMinutes === 'number') {
    const shifted = new Date(date.getTime() + config.offsetMinutes * 60 * 1000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
    };
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

export function dateFromZonedParts(parts, timezoneKey = 'local') {
  const config = getTimezoneConfig(timezoneKey);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);

  if (typeof config.offsetMinutes === 'number') {
    return new Date(Date.UTC(year, month - 1, day, hour, minute) - config.offsetMinutes * 60 * 1000);
  }

  return new Date(year, month - 1, day, hour, minute);
}

export function formatScheduleInputFromParts(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function formatScheduleInputFromDate(date, timezoneKey = 'local') {
  return formatScheduleInputFromParts(getZonedParts(date, timezoneKey));
}

export function parseScheduleInput(value, timezoneKey = 'local') {
  const normalized = String(value || '').trim().replace('T', ' ');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) {
    return { valid: false, reason: 'format' };
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };

  const daysInMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  const invalidParts =
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > daysInMonth ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59;

  if (invalidParts) {
    return { valid: false, reason: 'range' };
  }

  const date = dateFromZonedParts(parts, timezoneKey);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, reason: 'date' };
  }

  return { valid: true, date, iso: date.toISOString(), parts };
}

export function validateScheduledPickup(value, timezoneKey = 'local', messages = {}, now = new Date()) {
  const text = String(value || '').trim();
  const mergedMessages = { ...DEFAULT_MESSAGES, ...messages };
  if (!text) {
    return { valid: false, reason: 'required', message: mergedMessages.required };
  }

  const parsed = parseScheduleInput(text, timezoneKey);
  if (!parsed.valid) {
    return { ...parsed, message: mergedMessages.invalid };
  }

  if (parsed.date.getTime() <= now.getTime() + 2 * 60 * 1000) {
    return { ...parsed, valid: false, reason: 'future', message: mergedMessages.future };
  }

  return parsed;
}

export function describeScheduledPickup(value, timezoneKey = 'local') {
  const parsed = parseScheduleInput(value, timezoneKey);
  if (!parsed.valid) {
    return '';
  }
  const config = getTimezoneConfig(timezoneKey);
  const parts = getZonedParts(parsed.date, timezoneKey);
  return `${formatScheduleInputFromParts(parts)} ${config.shortLabel}`;
}
