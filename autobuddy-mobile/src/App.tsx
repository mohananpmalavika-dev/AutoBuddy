import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
        // TODO: Retrieve stored token from secure storage (AsyncStorage, SecureStore, etc)
        // const storedToken = await SecureStore.getItemAsync('auth_token');
        // if (storedToken) {
        //   const user = await fetchUserProfile(storedToken);
        //   setSession({ token: storedToken, user });
        // }
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
      // TODO: Call login API
      // const response = await apiRequest('/auth/login', {
      //   method: 'POST',
      //   body: credentials,
      // });
      // Store token securely
      // await SecureStore.setItemAsync('auth_token', response.token);
      // setSession(response);
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (data: any) => {
    try {
      setLoading(true);
      // TODO: Call signup API
      // const response = await apiRequest('/auth/signup', {
      //   method: 'POST',
      //   body: data,
      // });
      // Store token securely
      // await SecureStore.setItemAsync('auth_token', response.token);
      // setSession(response);
      // For passengers, show onboarding
      // if (response.user.role === 'passenger') {
      //   setPassengerOnboarded(true);
      // }
    } catch (error) {
      console.error('Signup failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // TODO: Call logout API if needed
      // await apiRequest('/auth/logout', { method: 'POST', token: session?.token });

      // Clear stored token
      // await SecureStore.deleteItemAsync('auth_token');

      setSession(null);
      setPassengerOnboarded(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handlePassengerOnboardingComplete = async (data: any) => {
    try {
      setLoading(true);
      // TODO: Call API to save onboarding data
      // await apiRequest('/passengers/onboarding/complete', {
      //   method: 'POST',
      //   token: session?.token,
      //   body: data,
      // });
      setPassengerOnboarded(true);
    } catch (error) {
      console.error('Onboarding failed:', error);
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
