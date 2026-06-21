import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApiClient, post, del, handleApiError } from './utils/apiClient';

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
        const storedToken = await AsyncStorage.getItem('authToken');
        if (storedToken) {
          // Reinitialize API client with stored token
          initializeApiClient(storedToken);
          // Parse stored user data
          const storedUserId = await AsyncStorage.getItem('userId');
          const storedRole = await AsyncStorage.getItem('userRole');
          const storedUserName = await AsyncStorage.getItem('userName');
          const storedUserEmail = await AsyncStorage.getItem('userEmail');
          const storedUserPhone = await AsyncStorage.getItem('userPhone');

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
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
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
        const { access_token, user } = response.data;

        // Store token and user data
        await AsyncStorage.setItem('authToken', access_token);
        await AsyncStorage.setItem('userId', user.id);
        await AsyncStorage.setItem('userRole', user.role);
        await AsyncStorage.setItem('userName', user.name || user.phone);
        await AsyncStorage.setItem('userEmail', user.email || '');
        await AsyncStorage.setItem('userPhone', user.phone);

        // Reinitialize API client with new token
        initializeApiClient(access_token);

        // Set session
        setSession({
          token: access_token,
          user: {
            id: user.id,
            name: user.name || user.phone,
            email: user.email,
            phone: user.phone,
            role: user.role,
            photo: user.photo,
          },
        });

        // For passengers, mark as needing onboarding
        if (user.role === 'passenger') {
          setPassengerOnboarded(false);
        }
      }
    } catch (error) {
      console.error('Login failed:', handleApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (data: any) => {
    try {
      setLoading(true);
      const response = await post<any>('/api/auth/signup', data);

      if (response.status === 'success' && response.data) {
        const { access_token, user } = response.data;

        // Store token and user data
        await AsyncStorage.setItem('authToken', access_token);
        await AsyncStorage.setItem('userId', user.id);
        await AsyncStorage.setItem('userRole', user.role);
        await AsyncStorage.setItem('userName', user.name || user.phone);
        await AsyncStorage.setItem('userEmail', user.email || '');
        await AsyncStorage.setItem('userPhone', user.phone);

        // Reinitialize API client with new token
        initializeApiClient(access_token);

        // Set session
        setSession({
          token: access_token,
          user: {
            id: user.id,
            name: user.name || user.phone,
            email: user.email,
            phone: user.phone,
            role: user.role,
            photo: user.photo,
          },
        });

        // For passengers, show onboarding
        if (user.role === 'passenger') {
          setPassengerOnboarded(false);
        }
      }
    } catch (error) {
      console.error('Signup failed:', handleApiError(error));
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

      // Clear stored token and user data
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userId');
      await AsyncStorage.removeItem('userRole');
      await AsyncStorage.removeItem('userName');
      await AsyncStorage.removeItem('userEmail');
      await AsyncStorage.removeItem('userPhone');

      setSession(null);
      setPassengerOnboarded(false);
    } catch (error) {
      console.error('Logout failed:', handleApiError(error));
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
  );
}
