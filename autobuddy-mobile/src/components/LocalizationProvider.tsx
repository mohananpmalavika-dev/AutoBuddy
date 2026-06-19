import React, { useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalization, LocalizationContext, SupportedLanguage } from '../hooks/useLocalization';

interface LocalizationProviderProps {
  children: ReactNode;
  defaultLanguage?: SupportedLanguage;
}

export const LocalizationProvider: React.FC<LocalizationProviderProps> = ({
  children,
  defaultLanguage = 'en',
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(defaultLanguage);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSavedLanguage();
  }, []);

  const loadSavedLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('appLanguage');
      if (savedLanguage && isValidLanguage(savedLanguage)) {
        setSelectedLanguage(savedLanguage as SupportedLanguage);
      }
    } catch (err) {
      console.error('Failed to load saved language:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isValidLanguage = (lang: string): lang is SupportedLanguage => {
    return ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ar', 'hi'].includes(lang);
  };

  const handleSetLanguage = async (language: SupportedLanguage) => {
    try {
      setSelectedLanguage(language);
      await AsyncStorage.setItem('appLanguage', language);
    } catch (err) {
      console.error('Failed to save language preference:', err);
    }
  };

  const localization = useLocalization(selectedLanguage);
  const contextValue = {
    ...localization,
    setLanguage: handleSetLanguage,
  };

  if (isLoading) {
    return null;
  }

  return (
    <LocalizationContext.Provider value={contextValue}>
      {children}
    </LocalizationContext.Provider>
  );
};

export default LocalizationProvider;
