import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ScheduledRidesPanel from './ScheduledRidesPanel';
import { apiRequest } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiRequest: jest.fn(),
}));

describe('ScheduledRidesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reschedules a ride via PATCH', async () => {
    apiRequest
      .mockResolvedValueOnce([
        {
          id: 'sched-1',
          pickup_location: 'A',
          dropoff_location: 'B',
          scheduled_time: '2026-06-02T10:30:00.000Z',
          recurring: false,
          recurrence_pattern: null,
          status: 'scheduled',
        },
      ])
      .mockResolvedValueOnce({ id: 'sched-1' })
      .mockResolvedValueOnce([]);

    const { getByText } = render(<ScheduledRidesPanel token="token-1" />);

    await waitFor(() => expect(getByText('Reschedule')).toBeTruthy());

    fireEvent.press(getByText('Reschedule'));
    fireEvent.press(getByText('Update'));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/v1/passengers/scheduled-rides/sched-1', expect.objectContaining({
        method: 'PATCH',
        token: 'token-1',
      }));
    });
  });
});
