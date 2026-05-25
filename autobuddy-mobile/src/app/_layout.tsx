import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { Platform, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

const RootView = Platform.OS === 'web' ? View : GestureHandlerRootView;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <RootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Slot />
      </ThemeProvider>
    </RootView>
  );
}
