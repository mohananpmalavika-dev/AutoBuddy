// Utilities for formatting dates/times in Indian Standard Time (Asia/Kolkata)
export function formatToIST(value, options = {}) {
  const d = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(d);
}

export function istISOString(value) {
  const d = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const year = map.year || '0000';
  const month = map.month || '01';
  const day = map.day || '01';
  const hour = map.hour || '00';
  const minute = map.minute || '00';
  const second = map.second || '00';
  // IST offset is +05:30
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`;
}

export function getISTHour(value) {
  const d = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return Number(map.hour || 0);
}

export function getISTMinute(value) {
  const d = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', minute: '2-digit' }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return Number(map.minute || 0);
}
