import { driverDashboardLocales } from '../locales/driverDashboard';
import { normalizeLanguageCode } from '../locales/indianLanguages';

/**
 * useDriverLocales - Custom hook for driver dashboard localization
 */
export function useDriverLocales() {
  // Get language from preferences context or default to 'en'
  // In a real app, this would come from a preferences context
  const language = typeof window !== 'undefined' && localStorage?.getItem('driverLanguage')
    ? normalizeLanguageCode(localStorage.getItem('driverLanguage'))
    : 'en';

  const strings = driverDashboardLocales[language] || driverDashboardLocales.en;

  return {
    strings,
    language,
    setLanguage: (lang) => {
      if (typeof window !== 'undefined') {
        const nextLanguage = normalizeLanguageCode(lang);
        localStorage?.setItem('driverLanguage', nextLanguage);
        localStorage?.setItem('autobuddy_lang', nextLanguage);
        window.location.reload(); // Simple approach - can be optimized with context
      }
    },
  };
}

/**
 * Get localized string by key
 */
export function getDriverString(key, fallback = '') {
  const language = typeof window !== 'undefined' && localStorage?.getItem('driverLanguage')
    ? normalizeLanguageCode(localStorage.getItem('driverLanguage'))
    : 'en';

  const strings = driverDashboardLocales[language] || driverDashboardLocales.en;
  return strings[key] || fallback || key;
}
