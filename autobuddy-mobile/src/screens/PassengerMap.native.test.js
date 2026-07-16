import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import PassengerMap from './PassengerMap.native';
import { apiRequest } from '../lib/api';
import { NotificationProvider } from '../contexts/NotificationContext';

function mockPanel(label) {
  const ReactNative = require('react-native');
  const React = require('react');
  const MockPanel = () => React.createElement(
    ReactNative.View,
    null,
    React.createElement(ReactNative.Text, null, label),
  );
  MockPanel.displayName = label;
  return MockPanel;
}

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  reverseGeocodeAsync: jest.fn(async () => []),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 13.08, longitude: 80.27 },
  })),
  Accuracy: { Balanced: 'balanced' },
}));

jest.mock('../components/FreeMap', () => {
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

jest.mock('../hooks/useNotificationManager', () => ({
  useNotificationManager: jest.fn(),
}));

jest.mock('../components/InteractiveMap', () => mockPanel('InteractiveMap'));
jest.mock('../components/RevenueCard', () => mockPanel('RevenueCard'));
jest.mock('../components/RideProductsGrid', () => mockPanel('RideProductsGrid'));
jest.mock('../components/RideCommunicationCard', () => mockPanel('RideCommunicationCard'));
jest.mock('../components/VoiceTextInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return (props) => <TextInput {...props} />;
});
jest.mock('../components/BookingConfirmationCard', () => () => null);
jest.mock('../components/KeralaSafetyCard', () => mockPanel('KeralaSafetyCard'));
jest.mock('../components/NotificationCenter', () => mockPanel('NotificationCenter'));
jest.mock('../components/PromoCodePanel', () => mockPanel('PromoCodePanel'));
jest.mock('../components/SupportTicketsPanel', () => mockPanel('SupportTicketsPanel'));
jest.mock('../components/PaymentMethodsPanel', () => mockPanel('PaymentMethodsPanel'));
jest.mock('../components/PassengerRatingsPanel', () => mockPanel('PassengerRatingsPanel'));
jest.mock('../components/FavoriteDriversPanel', () => mockPanel('FavoriteDriversPanel'));
jest.mock('../components/PreferencesPanel', () => mockPanel('PreferencesPanel'));
jest.mock('../components/SavedPlacesPanel', () => mockPanel('SavedPlacesPanel'));
jest.mock('../components/EmergencyContactsPanel', () => mockPanel('EmergencyContactsPanel'));
jest.mock('../components/AccessibilityPanel', () => mockPanel('AccessibilityPanel'));
jest.mock('../components/PassengerScheduledRidesPanel', () => mockPanel('PassengerScheduledRidesPanel'));
jest.mock('../components/PassengerProfilePanel', () => mockPanel('PassengerProfilePanel'));
jest.mock('../components/PassengerKYCPanel', () => mockPanel('PassengerKYCPanel'));
jest.mock('../components/PassengerDocumentsPanel', () => mockPanel('PassengerDocumentsPanel'));
jest.mock('../components/ReceiptsPanel', () => mockPanel('ReceiptsPanel'));
jest.mock('../components/SubscriptionPanel', () => mockPanel('SubscriptionPanel'));

function renderPassengerMap(props) {
  return render(
    <NotificationProvider>
      <PassengerMap {...props} />
    </NotificationProvider>,
  );
}

const vehicleTypesFixture = [
  {
    id: 'auto',
    name: 'Auto',
    subtypes: [
      { id: 'auto_standard', name: 'Auto Standard' },
      { id: 'auto_premium', name: 'Auto Premium' },
    ],
  },
  {
    id: 'taxi',
    name: 'Taxi',
    subtypes: [{ id: 'taxi_sedan', name: 'Sedan' }],
  },
];

function mockPassengerApi({ activeBooking = null } = {}) {
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
    if (path === '/api/vehicles/public/all') {
      return vehicleTypesFixture;
    }
    if (path === '/bookings/active') {
      return activeBooking;
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
}

function mockAppState(currentState) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: currentState });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
}

describe('PassengerMap native menu flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState('background');
    mockPassengerApi();
  });

  it('opens ride details picker from the Ride chip', async () => {
    const { getByLabelText, getByText, queryByText } = renderPassengerMap({
      token: 'token-1',
      user: { id: 'passenger-1', name: 'Alex' },
      onLogout: () => {},
    });

    await waitFor(() => expect(getByText('Where are you going?')).toBeTruthy());
    await waitFor(() => expect(getByText('Auto / Auto Standard / Normal')).toBeTruthy());

    fireEvent.press(getByLabelText('Select ride details'));

    await waitFor(() => expect(getByText('Choose your ride')).toBeTruthy());
    expect(getByText('Vehicle type')).toBeTruthy();
    expect(getByText('Vehicle model')).toBeTruthy();
    expect(getByText('RideProductsGrid')).toBeTruthy();
    expect(getByText('Passengers optional')).toBeTruthy();

    fireEvent.press(getByText('Done'));
    await waitFor(() => expect(queryByText('Choose your ride')).toBeNull());
  });

  it('opens secondary menus and switches to spin and notifications tabs', async () => {
    const { getAllByText, getByText } = renderPassengerMap({
      token: 'token-1',
      user: { id: 'passenger-1', name: 'Alex' },
      onLogout: () => {},
    });

    await waitFor(() => expect(getByText('Where are you going?')).toBeTruthy());

    fireEvent.press(getByText('Menu'));
    await waitFor(() => expect(getByText('Spin & Win')).toBeTruthy());
    fireEvent.press(getByText('Spin & Win'));
    await waitFor(() => expect(getAllByText('Spin & Win').length).toBeGreaterThan(0));

    fireEvent.press(getByText('Other Menus'));
    fireEvent.press(getByText('Notifications'));

    expect(getAllByText('Notifications').length).toBeGreaterThan(0);
  });

  it('opens emergency contacts from the active ride CTA', async () => {
    mockAppState('active');
    mockPassengerApi({
      activeBooking: {
        id: 'booking-1',
        status: 'accepted',
        driver_name: 'Ravi',
        pickup_location: { address: 'MG Road' },
        drop_location: { address: 'Central Station' },
        estimated_fare: 180,
      },
    });

    const { getByText } = renderPassengerMap({
      token: 'token-1',
      user: { id: 'passenger-1', name: 'Alex' },
      onLogout: () => {},
    });

    await waitFor(() => expect(getByText('Where are you going?')).toBeTruthy());

    fireEvent.press(getByText('Menu'));
    await waitFor(() => expect(getByText('Live Ride')).toBeTruthy());
    fireEvent.press(getByText('Live Ride'));
    await waitFor(() => expect(getByText('SOS quick access')).toBeTruthy());
    fireEvent.press(getByText('Contacts'));

    expect(getByText('EmergencyContactsPanel')).toBeTruthy();
  });
});
