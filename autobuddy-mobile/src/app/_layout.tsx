import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { Platform, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Sentry from '@sentry/react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

// Feature Context Providers
import { NotificationProvider } from '@/contexts/NotificationContext';
import { RatingsProvider } from '@/contexts/RatingsContext';
import { SavedPlacesProvider } from '@/contexts/SavedPlacesContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { ScheduledRidesProvider } from '@/contexts/ScheduledRidesContext';
import { PaymentMethodsProvider } from '@/contexts/PaymentMethodsContext';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { PromoCodesProvider } from '@/contexts/PromoCodesContext';
import { SupportProvider } from '@/contexts/SupportContext';
import { AccessibilityProvider } from '@/contexts/AccessibilityContext';

const RootView = Platform.OS === 'web' ? View : GestureHandlerRootView;

// Initialize Sentry for error monitoring
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    tracesSampleRate: 1.0,
  });
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <RootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* Wrap all feature contexts */}
        <NotificationProvider>
          <RatingsProvider>
            <SavedPlacesProvider>
              <PreferencesProvider>
                <ScheduledRidesProvider>
                  <PaymentMethodsProvider>
                    <FavoritesProvider>
                      <PromoCodesProvider>
                        <SupportProvider>
                          <AccessibilityProvider>
                            <AnimatedSplashOverlay />
                            <Slot />
                          </AccessibilityProvider>
                        </SupportProvider>
                      </PromoCodesProvider>
                    </FavoritesProvider>
                  </PaymentMethodsProvider>
                </ScheduledRidesProvider>
              </PreferencesProvider>
            </SavedPlacesProvider>
          </RatingsProvider>
        </NotificationProvider>
      </ThemeProvider>
    </RootView>
  );
}
