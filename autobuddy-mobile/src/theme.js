const resolveDirectSunlightIndex = () => {
  const envValue = Number(process.env.EXPO_PUBLIC_OUTDOOR_DIRECT_SUNLIGHT_INDEX);
  if (Number.isFinite(envValue) && envValue >= 0) {
    return envValue;
  }
  const hour = new Date().getHours();
  // Midday fallback heuristic when explicit index is not provided.
  return hour >= 11 && hour <= 15 ? 8 : 4;
};

export const OUTDOOR_PEAK_DIRECT_SUNLIGHT_INDEX = resolveDirectSunlightIndex();
const APPLY_HIGH_CONTRAST_TEXT = OUTDOOR_PEAK_DIRECT_SUNLIGHT_INDEX >= 8;

const TEXT_CONTRAST_OVERRIDES = APPLY_HIGH_CONTRAST_TEXT
  ? {
      text: '#000000',
      textMain: '#000000',
      muted: '#1F2937',
      textMuted: '#1F2937',
      primaryDark: '#003914',
    }
  : {};

export const COLORS = {
  primary: '#0B7A3B',
  primaryDark: '#064E2A',
  gold: '#D6A84F',
  bg: '#F4F7F5',
  card: '#FFFFFF',
  text: '#102018',
  muted: '#6B756F',
  danger: '#C62828',
  success: '#1B8A4B',
  warning: '#F9A825',
  border: '#DDE5DF',
  background: '#F4F7F5',
  surface: '#FFFFFF',
  textMain: '#102018',
  textMuted: '#6B756F',
  secondary: '#1B8A4B',
  overlaySoft: 'rgba(6, 78, 42, 0.06)',
  overlayStrong: 'rgba(6, 78, 42, 0.12)',
  ...TEXT_CONTRAST_OVERRIDES,
};

export const SHADOWS = {
  card: {
    shadowColor: '#0A3D22',
    shadowOpacity: 0.11,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  soft: {
    shadowColor: '#0A3D22',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lift: {
    shadowColor: '#0A3D22',
    shadowOpacity: 0.15,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
};

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

export const TYPOGRAPHY = {
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.textMain,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMuted,
    lineHeight: 22,
  },
  malayalam: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    lineHeight: 21,
  },
};
