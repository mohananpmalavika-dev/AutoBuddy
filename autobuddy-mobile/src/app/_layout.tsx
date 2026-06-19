import { DarkTheme, DefaultTheme, Slot, ThemeProvider, usePathname, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Sentry from '@sentry/react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import RealtimeNotificationHost from '@/components/RealtimeNotificationHost';
import { initializeBackgroundNotifications } from '@/lib/backgroundNotificationService';
import { AppStateProvider } from '@/contexts/AppStateProvider';

const RootView = Platform.OS === 'web' ? View : GestureHandlerRootView;
const HOME_ROUTES = new Set(['/', '/app']);

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

  useEffect(() => {
    async function setupBackgroundNotifications() {
      try {
        await initializeBackgroundNotifications();
      } catch (error) {
        console.error('Failed to initialize background notifications:', error);
      }
    }

    setupBackgroundNotifications();
  }, []);

  return (
    <RootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppStateProvider>
          <AnimatedSplashOverlay />
          <Slot />
          <RouteHomeButton />
          <RealtimeNotificationHost />
        </AppStateProvider>
      </ThemeProvider>
    </RootView>
  );
}

function RouteHomeButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (!pathname || HOME_ROUTES.has(pathname)) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.routeHomeButtonWrap}>
      <Pressable
        accessibilityLabel="Go to AutoBuddy home"
        accessibilityRole="button"
        onPress={() => router.replace('/app')}
        style={({ pressed }) => [styles.routeHomeButton, pressed && styles.routeHomeButtonPressed]}>
        <MaterialIcons name="home" size={20} color="#FFFFFF" />
        <Text style={styles.routeHomeButtonText}>Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  routeHomeButtonWrap: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 120,
  },
  routeHomeButton: {
    minHeight: 46,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#11834A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  routeHomeButtonPressed: {
    opacity: 0.82,
  },
  routeHomeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
