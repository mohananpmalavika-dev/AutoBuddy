import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PassengerRatingsPanel from './PassengerRatingsPanel';
import { apiRequest } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiRequest: jest.fn(),
}));

describe('PassengerRatingsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates a rating via PATCH', async () => {
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === '/v1/passengers/ratings' && (!options.method || options.method === 'GET')) {
        return [
          {
            id: 'rating-1',
            driver_id: 'driver-1',
            booking_id: 'booking-1',
            score: 4,
            feedback: 'Good ride',
            created_at: new Date().toISOString(),
          },
        ];
      }
      if (path === '/bookings') {
        return [];
      }
      if (path === '/v1/passengers/ratings/rating-1' && options.method === 'PATCH') {
        return {
          id: 'rating-1',
          driver_id: 'driver-1',
          booking_id: 'booking-1',
          score: 5,
          feedback: 'Excellent ride',
          created_at: new Date().toISOString(),
        };
      }
      return [];
    });

    const { getByText, getByPlaceholderText, getAllByText } = render(<PassengerRatingsPanel token="token-1" />);

    await waitFor(() => expect(getByText('Edit')).toBeTruthy());

    fireEvent.press(getByText('Edit'));
    fireEvent.press(getAllByText('*')[0]);
    fireEvent.changeText(getByPlaceholderText('Share your experience...'), 'Excellent ride');
    fireEvent.press(getByText('Update Rating'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        '/v1/passengers/ratings/rating-1',
        expect.objectContaining({
          method: 'PATCH',
          token: 'token-1',
        }),
      );
    });
  });
});
