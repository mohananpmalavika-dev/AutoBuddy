import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalizationContext } from '../hooks/useLocalization';

export const LanguageSettingsScreen: React.FC = () => {
  const {
    currentLanguage,
    getAvailableLanguages,
    setLanguage,
    t,
  } = useLocalizationContext();

  const availableLanguages = getAvailableLanguages();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language Settings</Text>
        <Text style={styles.sectionDescription}>
          Select your preferred language for the AutoBuddy app
        </Text>

        {availableLanguages.map((language) => (
          <Pressable
            key={language.code}
            style={[
              styles.languageCard,
              currentLanguage === language.code && styles.languageCardActive,
            ]}
            onPress={() => setLanguage(language.code)}
          >
            <View style={styles.languageCardLeft}>
              <View
                style={[
                  styles.languageFlag,
                  {
                    backgroundColor:
                      language.code === 'en'
                        ? '#003DA5'
                        : language.code === 'es'
                          ? '#C60B1E'
                          : language.code === 'fr'
                            ? '#002395'
                            : language.code === 'de'
                              ? '#000'
                              : language.code === 'pt'
                                ? '#002B7F'
                                : language.code === 'zh'
                                  ? '#DE2910'
                                  : language.code === 'ja'
                                    ? '#BC002D'
                                    : language.code === 'ar'
                                      ? '#006C00'
                                      : '#FF9933',
                  },
                ]}
              >
                <Text style={styles.flagText}>{language.code.toUpperCase()}</Text>
              </View>
              <Text style={styles.languageName}>{language.name}</Text>
            </View>
            <View
              style={[
                styles.radioButton,
                currentLanguage === language.code && styles.radioButtonActive,
              ]}
            >
              {currentLanguage === language.code && (
                <MaterialIcons name="check" size={16} color="#fff" />
              )}
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Supported Features</Text>
        <FeatureItem
          icon="translate"
          title="Full Interface Translation"
          description="All app screens and menus are available in your selected language"
        />
        <FeatureItem
          icon="calendar-today"
          title="Localized Date & Time"
          description="Dates, times, and timezones adapt to your language and region"
        />
        <FeatureItem
          icon="attach-money"
          title="Currency Formatting"
          description="Numbers and currency display according to your locale"
        />
        <FeatureItem
          icon="text-fields"
          title="RTL Support"
          description="Right-to-left language layouts for Arabic and similar languages"
        />
      </View>

      <View style={styles.infoSection}>
        <MaterialIcons name="info" size={20} color="#2196F3" />
        <Text style={styles.infoText}>
          Your language preference is saved automatically. It will be applied to all screens in
          the app.
        </Text>
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

const FeatureItem: React.FC<{
  icon: string;
  title: string;
  description: string;
}> = ({ icon, title, description }) => {
  return (
    <View style={styles.featureItem}>
      <MaterialIcons name={icon as any} size={24} color="#2196F3" />
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageCardActive: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  languageCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageFlag: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  languageName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonActive: {
    borderColor: '#2196F3',
    backgroundColor: '#2196F3',
  },
  featureItem: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 11,
    color: '#999',
  },
  infoSection: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1565C0',
    lineHeight: 18,
  },
});

export default LanguageSettingsScreen;
