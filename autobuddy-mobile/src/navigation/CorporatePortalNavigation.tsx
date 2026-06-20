import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CorporateDashboardScreen } from '../screens/corporate/CorporateDashboardScreens';

const Stack = createNativeStackNavigator();

/**
 * Corporate Portal Navigation Stack
 * Accessible to admin users with corporate account access
 */
export const CorporatePortalNavigator: React.FC<{ accountId: string }> = ({ accountId }) => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#fff'
        },
        headerTintColor: '#333',
        headerTitleStyle: {
          fontWeight: '600'
        }
      }}
    >
      <Stack.Screen
        name="CorporateDashboard"
        options={{ title: 'Corporate Dashboard' }}
      >
        {props => <CorporateDashboardScreen accountId={accountId} {...props} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

export default CorporatePortalNavigator;
