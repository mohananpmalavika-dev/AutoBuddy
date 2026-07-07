import React, { useEffect } from 'react';
import { LogBox, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppShell from './src/AppShell';
import { initializeAllSystems, cleanupSystems, checkSystemHealth } from './src/utils/setupIntegration';

// Ignore specific warnings in development
if (__DEV__) {
  LogBox.ignoreLogs([
    'Non-serializable values were found in the navigation state',
    'ViewPropTypes will be removed',
    'AsyncStorage has been extracted from react-native core',
  ]);
}

/**
 * Main App Component
 * Entry point for the entire AutoBuddy application
 */
const App: React.FC = () => {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    setupApp();

    return () => {
      subscription.remove();
      cleanupSystems();
    };
  }, []);

  const setupApp = async () => {
    try {
      console.log('[App] Initializing AutoBuddy...');

      // Initialize all systems
      const success = await initializeAllSystems();

      if (!success) {
        console.warn('[App] Some systems failed to initialize');
      }

      // Check system health
      const health = await checkSystemHealth();
      console.log('[App] System health:', health);

      console.log('[App] ✓ AutoBuddy ready');
    } catch (err) {
      console.error('[App] Fatal initialization error:', err);
    }
  };

  const handleAppStateChange = async (state: AppStateStatus) => {
    console.log('[App] AppState changed to:', state);

    if (state === 'background') {
      // App moved to background
      console.log('[App] Saving state before background...');
      await cleanupSystems();
    } else if (state === 'active') {
      // App moved to foreground
      console.log('[App] Restoring state from background...');
      // Add any reinitialization logic here if needed
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppShell />
    </GestureHandlerRootView>
  );
};

export default App;
