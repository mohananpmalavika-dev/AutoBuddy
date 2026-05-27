import React from 'react';
import { Text, View } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PassengerMap from './PassengerMap.native';
import { apiRequest } from '../lib/api';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  reverseGeocodeAsync: jest.fn(async () => []),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 13.08, longitude: 80.27 },
  })),
  Accuracy: { Balanced: 'balanced' },
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMap = React.forwardRef((props, ref) => (
    <View ref={ref} testID="mock-map">
      {props.children}
    </View>
  ));
  const Marker = ({ children }) => <View>{children}</View>;
  return { __esModule: true, default: MockMap, Marker };
});

jest.mock('../lib/api', () => ({
  apiRequest: jest.fn(),
}));

jest.mock('../hooks/usePassengerRideRealtime', () => ({
  usePassengerRideRealtime: () => ({
    driverLocation: null,
    rideStatus: null,
    etaToPickup: null,
    etaToDrop: null,
    driverOnline: false,
  }),
}));

jest.mock('../hooks/useKeralaSafety', () => ({
  useKeralaSafety: () => ({
    loading: false,
    emergencyMode: false,
  }),
}));

jest.mock('../components/InteractiveMap', () => () => <View><Text>InteractiveMap</Text></View>);
jest.mock('../components/RevenueCard', () => () => <View><Text>RevenueCard</Text></View>);
jest.mock('../components/RideCommunicationCard', () => () => <View><Text>RideCommunicationCard</Text></View>);
jest.mock('../components/VoiceTextInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return (props) => <TextInput {...props} />;
});
jest.mock('../components/BookingConfirmationCard', () => () => null);
jest.mock('../components/KeralaSafetyCard', () => () => <View><Text>KeralaSafetyCard</Text></View>);
jest.mock('../components/PromoCodePanel', () => () => <View><Text>PromoCodePanel</Text></View>);
jest.mock('../components/SupportTicketsPanel', () => () => <View><Text>SupportTicketsPanel</Text></View>);
jest.mock('../components/PaymentMethodsPanel', () => () => <View><Text>PaymentMethodsPanel</Text></View>);
jest.mock('../components/PassengerRatingsPanel', () => () => <View><Text>PassengerRatingsPanel</Text></View>);
jest.mock('../components/PreferencesPanel', () => () => <View><Text>PreferencesPanel</Text></View>);
jest.mock('../components/SavedPlacesPanel', () => () => <View><Text>SavedPlacesPanel</Text></View>);
jest.mock('../components/EmergencyContactsPanel', () => () => <View><Text>EmergencyContactsPanel</Text></View>);
jest.mock('../components/AccessibilityPanel', () => () => <View><Text>AccessibilityPanel</Text></View>);
jest.mock('../components/ScheduledRidesPanel', () => () => <View><Text>ScheduledRidesPanel</Text></View>);

describe('PassengerMap native menu flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiRequest.mockImplementation(async (path) => {
      if (path === '/v1/passengers/preferences') {
        return { default_payment_method: 'cash' };
      }
      if (path === '/v1/passengers/accessibility') {
        return {
          text_size: 'normal',
          high_contrast: false,
          screen_reader_enabled: false,
          haptic_feedback: false,
          reduce_motion: false,
          voice_guidance: false,
        };
      }
      if (path === '/bookings/active') {
        return null;
      }
      if (path === '/bookings') {
        return [];
      }
      if (path === '/spin-win/config') {
        return {
          enabled: true,
          eligible: true,
          daily_spin_limit: 3,
          spins_used_today: 1,
          spins_left_today: 2,
        };
      }
      return [];
    });
  });

  it('opens secondary menus and switches to spin and notifications tabs', async () => {
    const { getByText, queryByText } = render(
      <PassengerMap
        token="token-1"
        user={{ id: 'passenger-1', name: 'Alex' }}
        onLogout={() => {}}
      />,
    );

    await waitFor(() => expect(getByText('Ride Flow')).toBeTruthy());

    fireEvent.press(getByText('Other Menus'));
    fireEvent.press(getByText('Spin & Win'));
    expect(getByText('Spin & Win')).toBeTruthy();

    fireEvent.press(getByText('Other Menus'));
    fireEvent.press(getByText('Notifications'));

    expect(getByText('Notifications')).toBeTruthy();
    expect(queryByText('Spin status is unavailable. Tap refresh.')).toBeNull();
  });
});
