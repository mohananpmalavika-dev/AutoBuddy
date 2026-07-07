import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApiClient, post, del, handleApiError } from './utils/apiClient';
import { validateUser, type ValidatedUser } from './utils/userValidator';
import { UserModeProvider } from './contexts/UserModeContext';
// BUG-006 FIX: Import safe storage utilities
import { safeGetItem, safeSetItem, safeRemoveItem } from './utils/safeStorage';

// Auth screens
import LoginScreen from './screens/auth/LoginScreen';
import SignupScreen from './screens/auth/SignupScreen';

// Passenger screens
import PassengerDashboard from './screens/PassengerDashboard';
import { SimplifiedOnboarding } from './components/PassengerSimplifiedOnboarding';

// Driver screens
import DriverDashboard from './screens/DriverDashboardSimplified';

// Operator screens
import OperatorDashboard from './screens/OperatorDashboard';

// Admin screens
import AdminDashboard from './screens/AdminDashboard';

// AI Travel Intent Engine
import TravelIntentDashboard from './screens/TravelIntentDashboard';

// Types
export type AppSession = {
  token: string;
  user: {
    id: string;
    name: string;
    email?: string;
    phone: string;
    role: 'passenger' | 'driver' | 'operator' | 'admin';
    photo?: string;
  };
};

const Stack = createNativeStackNavigator();

/**
 * Root app component with role-based navigation
 */
export default function App() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [passengerOnboarded, setPassengerOnboarded] = useState(false);

  // Check if user is already authenticated (e.g., from stored token)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // BUG-006 FIX: Use safeGetItem instead of direct AsyncStorage access
        const tokenResult = await safeGetItem<string>('authToken');
        if (tokenResult.success && tokenResult.data) {
          const storedToken = tokenResult.data;
          
          // Reinitialize API client with stored token
          initializeApiClient(storedToken);
          
          // Parse stored user data with safe storage
          const [userIdResult, roleResult, nameResult, emailResult, phoneResult] = await Promise.all([
            safeGetItem<string>('userId'),
            safeGetItem<string>('userRole'),
            safeGetItem<string>('userName'),
            safeGetItem<string>('userEmail'),
            safeGetItem<string>('userPhone'),
          ]);

          const storedUserId = userIdResult.data;
          const storedRole = roleResult.data;
          const storedUserName = nameResult.data;
          const storedUserEmail = emailResult.data;
          const storedUserPhone = phoneResult.data;

          if (storedUserId && storedRole && storedUserName && storedUserPhone) {
            setSession({
              token: storedToken,
              user: {
                id: storedUserId,
                name: storedUserName,
                email: storedUserEmail || undefined,
                phone: storedUserPhone,
                role: storedRole as any,
              },
            });
            // Mark passenger as onboarded if role is passenger
            if (storedRole === 'passenger') {
              setPassengerOnboarded(true);
            }
          } else {
            // Incomplete session data, clear storage
            console.warn('[App] Incomplete session data, clearing storage');
            await safeRemoveItem('authToken');
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // BUG-006 FIX: Handle storage errors gracefully
        Alert.alert(
          'Storage Error',
          'Failed to load session data. You may need to log in again.'
        );
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogin = async (credentials: { phone: string; password: string }) => {
    try {
      setLoading(true);
      const response = await post<any>('/api/auth/login', credentials);

      if (response.status === 'success' && response.data) {
        const { access_token, user: rawUser } = response.data;

        // BUG-001 FIX: Validate user object before using
        const user = validateUser(rawUser);
        
        if (!user) {
          Alert.alert(
            'Login Error',
            'Invalid user data received from server. Please try again or contact support.'
          );
          console.error('[Login] User validation failed. Raw data:', rawUser);
          return;
        }

        // Store token and user data with error handling
        // BUG-006 FIX: Use safeSetItem for all storage operations
        const storageResults = await Promise.all([
          safeSetItem('authToken', access_token),
          safeSetItem('userId', user.id),
          safeSetItem('userRole', user.role),
          safeSetItem('userName', user.name || user.phone),
          safeSetItem('userEmail', user.email || ''),
          safeSetItem('userPhone', user.phone),
        ]);

        // Check if any storage operation failed
        const failedStorage = storageResults.find(result => !result.success);
        if (failedStorage) {
          console.error('[Login] Failed to save session data:', failedStorage.error);
          Alert.alert(
            'Storage Error',
            failedStorage.error || 'Failed to save login session. Please check device storage and try again.'
          );
          return;
        }

        // Reinitialize API client with new token
        initializeApiClient(access_token);

        // Set session
        setSession({
          token: access_token,
          user: {
            id: user.id,
            name: user.name || user.phone,
            email: user.email || undefined,
            phone: user.phone,
            role: user.role,
            photo: user.photo || undefined,
          },
        });

        // For passengers, mark as needing onboarding
        if (user.role === 'passenger') {
          setPassengerOnboarded(false);
        }
      }
    } catch (error) {
      console.error('[Login] Login failed:', error);
      const errorMessage = (error as any)?.userMessage || (error as any)?.message || 'Login failed. Please try again.';
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (data: any) => {
    try {
      setLoading(true);
      const response = await post<any>('/api/auth/signup', data);

      if (response.status === 'success' && response.data) {
        const { access_token, user: rawUser } = response.data;

        // BUG-001 FIX: Validate user object before using
        const user = validateUser(rawUser);
        
        if (!user) {
          Alert.alert(
            'Signup Error',
            'Invalid user data received from server. Please try again or contact support.'
          );
          console.error('[Signup] User validation failed. Raw data:', rawUser);
          return;
        }

        // Store token and user data with error handling
        try {
          await AsyncStorage.setItem('authToken', access_token);
          await AsyncStorage.setItem('userId', user.id);
          await AsyncStorage.setItem('userRole', user.role);
          await AsyncStorage.setItem('userName', user.name || user.phone);
          await AsyncStorage.setItem('userEmail', user.email || '');
          await AsyncStorage.setItem('userPhone', user.phone);
        } catch (storageError) {
          console.error('[Signup] Failed to save session data:', storageError);
          Alert.alert(
            'Storage Error',
            'Failed to save signup session. Please check device storage and try again.'
          );
          return;
        }

        // Reinitialize API client with new token
        initializeApiClient(access_token);

        // Set session
        setSession({
          token: access_token,
          user: {
            id: user.id,
            name: user.name || user.phone,
            email: user.email || undefined,
            phone: user.phone,
            role: user.role,
            photo: user.photo || undefined,
          },
        });

        // For passengers, show onboarding
        if (user.role === 'passenger') {
          setPassengerOnboarded(false);
        }
      }
    } catch (error) {
      console.error('[Signup] Signup failed:', error);
      const errorMessage = (error as any)?.userMessage || (error as any)?.message || 'Signup failed. Please try again.';
      Alert.alert('Signup Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Call logout API if session exists
      if (session?.token) {
        try {
          await del('/api/auth/logout');
        } catch (error) {
          // Continue with logout even if API call fails
          console.warn('Logout API call failed, clearing local data:', error);
        }
      }

      // BUG-006 FIX: Use safeRemoveItem for all storage operations
      await Promise.all([
        safeRemoveItem('authToken'),
        safeRemoveItem('userId'),
        safeRemoveItem('userRole'),
        safeRemoveItem('userName'),
        safeRemoveItem('userEmail'),
        safeRemoveItem('userPhone'),
      ]);

      setSession(null);
      setPassengerOnboarded(false);
    } catch (error) {
      console.error('Logout failed:', handleApiError(error));
      // BUG-006 FIX: Show user-friendly error but still clear session
      Alert.alert(
        'Logout Notice',
        'Session cleared locally. You may need to clear app data if issues persist.'
      );
      setSession(null);
      setPassengerOnboarded(false);
    }
  };

  const handlePassengerOnboardingComplete = async (data: any) => {
    try {
      setLoading(true);
      const response = await post<any>('/api/passengers/onboarding/complete', data);

      if (response.status === 'success') {
        setPassengerOnboarded(true);
      }
    } catch (error) {
      console.error('Onboarding failed:', handleApiError(error));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <UserModeProvider userId={session?.user?.id || ''}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animationEnabled: true,
          }}
        >
        {!session ? (
          // Auth Stack
          <>
            <Stack.Screen
              name="Login"
              children={() => (
                <LoginScreen
                  onLogin={handleLogin}
                  onSignupPress={() => {}}
                />
              )}
            />
            <Stack.Screen
              name="Signup"
              children={() => (
                <SignupScreen
                  onSignup={handleSignup}
                  onLoginPress={() => {}}
                />
              )}
            />
          </>
        ) : (
          // Role-based stacks
          <>
            {session.user.role === 'passenger' && (
              <>
                {!passengerOnboarded ? (
                  <Stack.Screen
                    name="PassengerOnboarding"
                    children={() => (
                      <SimplifiedOnboarding
                        onComplete={handlePassengerOnboardingComplete}
                        onSkip={() => setPassengerOnboarded(true)}
                      />
                    )}
                  />
                ) : (
                  <Stack.Screen
                    name="PassengerApp"
                    children={() => (
                      <PassengerDashboard
                        token={session.token}
                        user={session.user}
                        onLogout={handleLogout}
                      />
                    )}
                  />
                )}
                <Stack.Screen
                  name="TravelIntent"
                  children={() => (
                    <TravelIntentDashboard
                      token={session.token}
                      user={session.user}
                    />
                  )}
                />
              </>
            )}

            {session.user.role === 'driver' && (
              <Stack.Screen
                name="DriverApp"
                children={() => (
                  <DriverDashboard
                    token={session.token}
                    user={session.user}
                    onLogout={handleLogout}
                  />
                )}
              />
            )}

            {session.user.role === 'operator' && (
              <Stack.Screen
                name="OperatorApp"
                children={() => (
                  <OperatorDashboard
                    token={session.token}
                    onLogout={handleLogout}
                  />
                )}
              />
            )}

            {session.user.role === 'admin' && (
              <Stack.Screen
                name="AdminApp"
                children={() => (
                  <AdminDashboard
                    token={session.token}
                    onLogout={handleLogout}
                  />
                )}
              />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </UserModeProvider>
  );
}
