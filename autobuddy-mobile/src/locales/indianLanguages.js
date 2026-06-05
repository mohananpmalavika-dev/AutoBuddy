export const INDIAN_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English', nativeLabel: 'English', speech: 'en-IN' },
  { value: 'as', label: 'Assamese', nativeLabel: '\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be', speech: 'as-IN' },
  { value: 'bn', label: 'Bengali', nativeLabel: '\u09ac\u09be\u0982\u09b2\u09be', speech: 'bn-IN' },
  { value: 'brx', label: 'Bodo', nativeLabel: '\u092c\u0921\u093c\u094b', speech: 'brx-IN' },
  { value: 'doi', label: 'Dogri', nativeLabel: '\u0921\u094b\u0917\u0930\u0940', speech: 'doi-IN' },
  { value: 'gu', label: 'Gujarati', nativeLabel: '\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0', speech: 'gu-IN' },
  { value: 'hi', label: 'Hindi', nativeLabel: '\u0939\u093f\u0928\u094d\u0926\u0940', speech: 'hi-IN' },
  { value: 'kn', label: 'Kannada', nativeLabel: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1', speech: 'kn-IN' },
  { value: 'ks', label: 'Kashmiri', nativeLabel: '\u06a9\u0672\u0634\u064f\u0631', speech: 'ks-IN' },
  { value: 'kok', label: 'Konkani', nativeLabel: '\u0915\u094b\u0902\u0915\u0923\u0940', speech: 'kok-IN' },
  { value: 'mai', label: 'Maithili', nativeLabel: '\u092e\u0948\u0925\u093f\u0932\u0940', speech: 'mai-IN' },
  { value: 'ml', label: 'Malayalam', nativeLabel: '\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02', speech: 'ml-IN' },
  { value: 'mni', label: 'Manipuri', nativeLabel: '\u09ae\u09c8\u09a4\u09c8\u09b2\u09cb\u09a8', speech: 'mni-IN' },
  { value: 'mr', label: 'Marathi', nativeLabel: '\u092e\u0930\u093e\u0920\u0940', speech: 'mr-IN' },
  { value: 'ne', label: 'Nepali', nativeLabel: '\u0928\u0947\u092a\u093e\u0932\u0940', speech: 'ne-IN' },
  { value: 'or', label: 'Odia', nativeLabel: '\u0b13\u0b21\u0b3c\u0b3f\u0b06', speech: 'or-IN' },
  { value: 'pa', label: 'Punjabi', nativeLabel: '\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40', speech: 'pa-IN' },
  { value: 'sa', label: 'Sanskrit', nativeLabel: '\u0938\u0902\u0938\u094d\u0915\u0943\u0924\u092e\u094d', speech: 'sa-IN' },
  { value: 'sat', label: 'Santali', nativeLabel: '\u1c65\u1c5f\u1c71\u1c5b\u1c5f\u1c72\u1c64', speech: 'sat-IN' },
  { value: 'sd', label: 'Sindhi', nativeLabel: '\u0633\u0646\u068c\u064a', speech: 'sd-IN' },
  { value: 'ta', label: 'Tamil', nativeLabel: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd', speech: 'ta-IN' },
  { value: 'te', label: 'Telugu', nativeLabel: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41', speech: 'te-IN' },
  { value: 'ur', label: 'Urdu', nativeLabel: '\u0627\u0631\u062f\u0648', speech: 'ur-IN' },
];

export const SUPPORTED_LANGUAGE_CODES = INDIAN_LANGUAGE_OPTIONS.map((language) => language.value);
export const SUPPORTED_LANGUAGE_CODE_SET = new Set(SUPPORTED_LANGUAGE_CODES);

export function normalizeLanguageCode(value, fallback = 'en') {
  const normalized = String(value || '').trim().toLowerCase().replace('_', '-');
  const baseCode = normalized.split('-')[0];
  if (SUPPORTED_LANGUAGE_CODE_SET.has(normalized)) {
    return normalized;
  }
  if (SUPPORTED_LANGUAGE_CODE_SET.has(baseCode)) {
    return baseCode;
  }
  return fallback;
}

export function getLanguageOption(value) {
  const code = normalizeLanguageCode(value);
  return INDIAN_LANGUAGE_OPTIONS.find((language) => language.value === code) || INDIAN_LANGUAGE_OPTIONS[0];
}

export function getLanguageLabel(value, { preferNative = false } = {}) {
  const language = getLanguageOption(value);
  if (preferNative) {
    return language.nativeLabel || language.label;
  }
  if (!language.nativeLabel || language.nativeLabel === language.label) {
    return language.label;
  }
  return `${language.label} (${language.nativeLabel})`;
}

export function buildLanguageOptions({ includeEnglish = true, preferNative = false } = {}) {
  return INDIAN_LANGUAGE_OPTIONS
    .filter((language) => includeEnglish || language.value !== 'en')
    .map((language) => ({
      value: language.value,
      code: language.value,
      label: getLanguageLabel(language.value, { preferNative }),
      englishLabel: language.label,
      nativeLabel: language.nativeLabel,
      speech: language.speech,
    }));
}
