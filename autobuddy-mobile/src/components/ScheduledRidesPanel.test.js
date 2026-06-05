import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PassengerScheduledRidesPanel from './PassengerScheduledRidesPanel';
import { apiRequest } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiRequest: jest.fn(),
}));

describe('PassengerScheduledRidesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('cancels a scheduled booking via the real bookings API', async () => {
    const onRideCancelled = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons = []) => {
      const cancelAction = buttons.find((button) => button.text === 'Cancel Ride');
      cancelAction?.onPress?.();
    });

    apiRequest.mockImplementation(async (path) => {
      if (path === '/bookings') {
        return [
          {
            id: 'sched-1',
            pickup_location: 'A',
            drop_location: 'B',
            scheduled_for: '2026-06-02T10:30:00.000Z',
            ride_product: 'scheduled',
            status: 'scheduled',
            estimated_fare: 250,
          },
        ];
      }
      if (path === '/bookings/sched-1/cancel') {
        return { id: 'sched-1', status: 'cancelled' };
      }
      return [];
    });

    const { getByText } = render(
      <PassengerScheduledRidesPanel token="token-1" onRideCancelled={onRideCancelled} />,
    );

    await waitFor(() => expect(getByText('Cancel Ride')).toBeTruthy());

    fireEvent.press(getByText('Cancel Ride'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/bookings/sched-1/cancel', expect.objectContaining({
        method: 'PUT',
        token: 'token-1',
      }));
      expect(onRideCancelled).toHaveBeenCalledWith(expect.objectContaining({ id: 'sched-1' }));
    });
  });

  it('loads scheduled rides from bookings instead of deprecated passenger scheduled routes', async () => {
    apiRequest.mockResolvedValue([
      {
        id: 'sched-1',
        pickup_location: 'A',
        drop_location: 'B',
        scheduled_for: '2026-06-02T10:30:00.000Z',
        ride_product: 'scheduled',
        status: 'scheduled',
      },
    ]);

    const { getByText } = render(<PassengerScheduledRidesPanel token="token-1" />);

    await waitFor(() => expect(getByText('Cancel Ride')).toBeTruthy());

    expect(apiRequest).toHaveBeenCalledWith('/bookings', expect.objectContaining({
      token: 'token-1',
      query: { limit: 200 },
    }));
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('/v1/passengers/scheduled-rides'),
      expect.anything(),
    );
  });
});
