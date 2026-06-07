import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LocationSharingPanel from './LocationSharingPanel';
import { apiRequest } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiRequest: jest.fn(),
}));

describe('LocationSharingPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads passenger emergency contacts from the sharing-compatible endpoint', async () => {
    apiRequest.mockResolvedValueOnce({
      contacts: [
        {
          id: 'contact-1',
          name: 'Asha',
          phone_number: '9999999999',
          relationship: 'Family',
        },
      ],
    });

    const { getByText } = render(
      <LocationSharingPanel
        token="token-1"
        activeBooking={{ id: 'booking-1' }}
        currentLocation={{ latitude: 8.8932, longitude: 76.6141 }}
      />,
    );

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/passengers/emergency-contacts', { token: 'token-1' });
      expect(getByText('Asha')).toBeTruthy();
    });
  });

  it('posts location-sharing updates with contact, booking, and location details', async () => {
    const currentLocation = { latitude: 8.8932, longitude: 76.6141 };
    apiRequest
      .mockResolvedValueOnce({
        contacts: [
          {
            id: 'contact-1',
            name: 'Asha',
            phone_number: '9999999999',
            relationship: 'Family',
          },
        ],
      })
      .mockResolvedValueOnce({ message: 'Location sharing updated' });

    const { getByText } = render(
      <LocationSharingPanel
        token="token-1"
        activeBooking={{ id: 'booking-1' }}
        currentLocation={currentLocation}
      />,
    );

    await waitFor(() => expect(getByText('Share Location')).toBeTruthy());
    fireEvent.press(getByText('Share Location'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenLastCalledWith('/passengers/location-sharing/update', {
        token: 'token-1',
        method: 'POST',
        body: {
          contact_id: 'contact-1',
          booking_id: 'booking-1',
          enabled: true,
          location: currentLocation,
        },
      });
    });
  });
});
