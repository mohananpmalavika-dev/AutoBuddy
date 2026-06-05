export function getDisplayText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const joined = value.map((item) => getDisplayText(item, '')).filter(Boolean).join(', ');
    return joined || fallback;
  }

  if (typeof value === 'object') {
    const candidates = [
      value.title,
      value.label,
      value.name,
      value.message,
      value.msg,
      value.body,
      value.text,
      value.description,
      value.en,
      value.default,
    ];

    for (const candidate of candidates) {
      if (candidate === value) {
        continue;
      }
      const text = getDisplayText(candidate, '');
      if (text) {
        return text;
      }
    }
  }

  return fallback;
}

export function getDisplayMessage(value, fallback = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const title = getDisplayText(value.title, '');
    const description = getDisplayText(value.description, '');
    if (title && description && title !== description) {
      return `${title}: ${description}`;
    }
  }

  return getDisplayText(value, fallback);
}
