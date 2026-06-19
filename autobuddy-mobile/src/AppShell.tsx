import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { Text } from 'react-native';

import LocalizationProvider from './components/LocalizationProvider';
import { initializeApiClient } from './utils/apiClient';
import { setupPerformanceMonitoring } from './utils/setupIntegration';

// Auth Screens
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';

// Driver Screens
import DriverDashboardScreen from './screens/DriverDashboardScreen';
import DriverVehicleManagementScreen from './screens/DriverVehicleManagementScreen';
import RouteOptimizationScreen from './screens/RouteOptimizationScreen';
import RidePoolingScreen from './screens/RidePoolingScreen';
import IncentivesTrackingScreen from './screens/IncentivesTrackingScreen';
import RidePreferencesScreen from './screens/RidePreferencesScreen';
import DriverPerformanceInsightsScreen from './screens/DriverPerformanceInsightsScreen';

// Passenger Screens
import PassengerDashboardScreen from './screens/PassengerDashboardScreen';
import RideBookingScreen from './screens/RideBookingScreen';
import PassengerInsuranceScreen from './screens/PassengerInsuranceScreen';

// Financial Screens
import WalletScreen from './screens/WalletScreen';
import ExpenseTrackingScreen from './screens/ExpenseTrackingScreen';
import RideReceiptsScreen from './screens/RideReceiptsScreen';
import ReferralSystemScreen from './screens/ReferralSystemScreen';

// Analytics Screens
import AdvancedAnalyticsScreen from './screens/AdvancedAnalyticsScreen';

// Support Screens
import CustomerSupportScreen from './screens/CustomerSupportScreen';
import ModerationDashboard from './screens/ModerationDashboard';

// Feature Screens
import VideoCallScreen from './screens/VideoCallScreen';
import LanguageSettingsScreen from './screens/LanguageSettingsScreen';
import AccessibilityFeaturesScreen from './screens/AccessibilityFeaturesScreen';

// Settings Screens
import SettingsScreen from './screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

interface AuthContextType {
  token: string | null;
  userId: string | null;
  userRole: 'driver' | 'passenger' | 'operator' | 'admin' | null;
  login: (token: string, userId: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

export const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'driver' | 'passenger' | 'operator' | 'admin' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    bootstrapAsync();
  }, []);

  const bootstrapAsync = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('authToken');
      const savedUserId = await AsyncStorage.getItem('userId');
      const savedRole = await AsyncStorage.getItem('userRole');

      if (savedToken && savedUserId) {
        setToken(savedToken);
        setUserId(savedUserId);
        setUserRole((savedRole as any) || 'passenger');
        initializeApiClient(savedToken);
      }
    } catch (err) {
      console.error('Bootstrap error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (newToken: string, newUserId: string, role: string) => {
    setToken(newToken);
    setUserId(newUserId);
    setUserRole((role as any) || 'passenger');
    await AsyncStorage.setItem('authToken', newToken);
    await AsyncStorage.setItem('userId', newUserId);
    await AsyncStorage.setItem('userRole', role);
    initializeApiClient(newToken);
  };

  const logout = async () => {
    setToken(null);
    setUserId(null);
    setUserRole(null);
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('userId');
    await AsyncStorage.removeItem('userRole');
    initializeApiClient(null);
  };

  return (
    <AuthContext.Provider value={{ token, userId, userRole, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

const AuthStack = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      animationEnabled: true,
    }}
  >
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Signup" component={SignupScreen} />
  </Stack.Navigator>
);

const DriverTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: true,
      tabBarIcon: ({ focused, color, size }) => {
        const icons: Record<string, string> = {
          DriverDashboard: 'dashboard',
          VehicleManagement: 'directions-car',
          RouteOptimization: 'map',
          RidePooling: 'groups',
          Incentives: 'star',
          Financial: 'wallet',
          Analytics: 'analytics',
          Settings: 'settings',
        };
        return <MaterialIcons name={icons[route.name] as any} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#2196F3',
      tabBarInactiveTintColor: '#999',
    })}
  >
    <Tab.Screen
      name="DriverDashboard"
      component={DriverDashboardScreen}
      options={{ title: 'Dashboard' }}
    />
    <Tab.Screen
      name="VehicleManagement"
      component={DriverVehicleManagementScreen}
      options={{ title: 'Vehicles' }}
    />
    <Tab.Screen
      name="RouteOptimization"
      component={RouteOptimizationScreen}
      options={{ title: 'Routes' }}
    />
    <Tab.Screen
      name="RidePooling"
      component={RidePoolingScreen}
      options={{ title: 'Pooling' }}
    />
    <Tab.Screen
      name="Incentives"
      component={IncentivesTrackingScreen}
      options={{ title: 'Incentives' }}
    />
    <Tab.Screen
      name="Financial"
      component={WalletScreen}
      options={{ title: 'Wallet' }}
    />
    <Tab.Screen
      name="Analytics"
      component={AdvancedAnalyticsScreen}
      options={{ title: 'Analytics' }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{ title: 'Settings' }}
    />
  </Tab.Navigator>
);

const PassengerTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: true,
      tabBarIcon: ({ focused, color, size }) => {
        const icons: Record<string, string> = {
          PassengerDashboard: 'dashboard',
          RideBooking: 'directions-car',
          Insurance: 'shield',
          Financial: 'wallet',
          Support: 'help',
          Settings: 'settings',
        };
        return <MaterialIcons name={icons[route.name] as any} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#2196F3',
      tabBarInactiveTintColor: '#999',
    })}
  >
    <Tab.Screen
      name="PassengerDashboard"
      component={PassengerDashboardScreen}
      options={{ title: 'Dashboard' }}
    />
    <Tab.Screen
      name="RideBooking"
      component={RideBookingScreen}
      options={{ title: 'Book Ride' }}
    />
    <Tab.Screen
      name="Insurance"
      component={PassengerInsuranceScreen}
      options={{ title: 'Insurance' }}
    />
    <Tab.Screen
      name="Financial"
      component={WalletScreen}
      options={{ title: 'Wallet' }}
    />
    <Tab.Screen
      name="Support"
      component={CustomerSupportScreen}
      options={{ title: 'Support' }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{ title: 'Settings' }}
    />
  </Tab.Navigator>
);

const OperatorStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="OperatorDashboard"
      component={DriverDashboardScreen}
      options={{ title: 'Operations' }}
    />
    <Stack.Screen
      name="Compliance"
      component={ModerationDashboard}
      options={{ title: 'Compliance' }}
    />
    <Stack.Screen
      name="Analytics"
      component={AdvancedAnalyticsScreen}
      options={{ title: 'Analytics' }}
    />
  </Stack.Navigator>
);

const AdminStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="AdminDashboard"
      component={ModerationDashboard}
      options={{ title: 'Admin' }}
    />
    <Stack.Screen
      name="Moderation"
      component={ModerationDashboard}
      options={{ title: 'Moderation' }}
    />
    <Stack.Screen
      name="Analytics"
      component={AdvancedAnalyticsScreen}
      options={{ title: 'Analytics' }}
    />
  </Stack.Navigator>
);

const RootNavigator = () => {
  const { token, userId, userRole, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!token ? (
          <Stack.Screen
            name="Auth"
            component={AuthStack}
            options={{
              animationEnabled: false,
            }}
          />
        ) : (
          <Stack.Screen
            name="App"
            component={
              userRole === 'driver'
                ? DriverTabs
                : userRole === 'operator'
                  ? OperatorStack
                  : userRole === 'admin'
                    ? AdminStack
                    : PassengerTabs
            }
            options={{
              animationEnabled: false,
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export const AppShell: React.FC = () => {
  useEffect(() => {
    setupPerformanceMonitoring();
  }, []);

  return (
    <AuthProvider>
      <LocalizationProvider defaultLanguage="en">
        <RootNavigator />
      </LocalizationProvider>
    </AuthProvider>
  );
};

export default AppShell;
